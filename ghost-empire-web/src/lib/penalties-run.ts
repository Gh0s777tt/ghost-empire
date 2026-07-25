// src/lib/penalties-run.ts
// The DB-facing half of "kary" (#806): load a portal's config + catalogue, draw, persist the draw, and
// hand the actuator an ObsAction. The DECISIONS live in `lib/penalties.ts` (pure, tested); this file
// only does I/O and translation, so there is exactly one place where randomness is decided.
//
// SAFE TO DEPLOY BEFORE THE TABLES EXIST. Every read is `.catch()`-guarded and a failure degrades to
// "penalties off" — never a 500. That is deliberate: it removes the columns-before-code ordering
// hazard entirely, so this can ship and the migration can follow whenever the owner is ready.
//
// ⚠️ OFF BY DEFAULT AND MUST STAY OFF IN PRODUCTION until the gambling-law question in
// docs/CHIPS-CASINO.md is answered. `PenaltyConfig.enabled` defaults to false; nothing here flips it.
import { prisma } from "@/lib/prisma";
import { cryptoRng } from "@/lib/secure-rng";
import { createLogger } from "@/lib/logger";
import { drawPenalty, eligiblePenalties, canFireNow, queueSlot, type PenaltySpec } from "@/lib/penalties";
import type { ObsAction } from "@/lib/obs-rules";

const log = createLogger("penalties");

/** Why a donation produced no penalty. Returned rather than thrown — this is a best-effort effect. */
export type PenaltySkip =
  | "disabled"
  | "below_minimum"
  | "no_pool"
  | "cooldown"
  | "queue_full"
  | "unknown_amount";

export type PenaltyOutcome =
  | { fired: true; drawId: string; label: string; intensity: number; durationMs: number; startsAt: Date }
  | { fired: false; reason: PenaltySkip };

/** Turn a stored catalogue row into the pure spec the draw understands. */
function toSpec(row: { id: string; weight: number; minPlnGrosze: number; minIntensity: number; maxIntensity: number; minDurationMs: number; maxDurationMs: number }): PenaltySpec {
  return {
    id: row.id,
    weight: row.weight,
    // The pure layer works in PLN; the DB stores grosze so a threshold cannot drift by rounding.
    minPln: row.minPlnGrosze / 100,
    minIntensity: row.minIntensity,
    maxIntensity: row.maxIntensity,
    minDurationMs: row.minDurationMs,
    maxDurationMs: row.maxDurationMs,
  };
}

/**
 * Build the actuator action for a drawn penalty.
 *
 * @remarks
 * `set_filter_intensity` is the only kind that carries the drawn intensity — the other three are
 * on/off, so for them the intensity is recorded in the audit row but has nothing to drive. That is
 * honest rather than hidden: a streamer who wants intensity to matter configures an intensity penalty.
 */
export function penaltyAction(
  row: { actionKind: string; scene: string | null; source: string | null; filter: string | null; setting: string | null; rangeMin: number | null; rangeMax: number | null; targetState: boolean | null },
  intensity: number,
  durationMs: number,
): ObsAction | null {
  switch (row.actionKind) {
    case "switch_scene":
      return row.scene ? { kind: "switch_scene", scene: row.scene, revertAfterMs: durationMs } : null;
    case "toggle_source":
      return row.scene && row.source
        ? { kind: "toggle_source", scene: row.scene, source: row.source, visible: row.targetState ?? true, revertAfterMs: durationMs }
        : null;
    case "toggle_filter":
      return row.source && row.filter
        ? { kind: "toggle_filter", source: row.source, filter: row.filter, enabled: row.targetState ?? true, revertAfterMs: durationMs }
        : null;
    case "set_filter_intensity":
      return row.source && row.filter && row.setting && row.rangeMin !== null && row.rangeMax !== null
        ? {
            kind: "set_filter_intensity",
            source: row.source,
            filter: row.filter,
            setting: row.setting,
            min: row.rangeMin,
            max: row.rangeMax,
            intensity,
            revertAfterMs: durationMs,
          }
        : null;
    default:
      return null;
  }
}

/**
 * Draw and record a penalty for a donation. Never throws.
 *
 * @param input - The donation: its PLN value, what it was, and who sent it.
 * @param tenantId - The portal, or null for the founder/legacy row.
 * @returns Whether a penalty fired, and if not, why — so the caller can log something useful.
 *
 * @remarks
 * `plnAmount` must be the PLN value from the donation pipeline's FX table, not the raw minor amount:
 * tiers are configured in PLN, so feeding it 5000 RUB-minor would unlock the harshest tier for a ~220
 * PLN donation. A null PLN value (unknown currency) draws nothing — the same rule the mint gate uses.
 */
export async function runPenaltyForDonation(
  input: {
    plnAmount: number | null;
    amountGrosze: number;
    currency: string;
    donorName: string | null;
    donationId?: string | null;
  },
  tenantId: string | null,
): Promise<PenaltyOutcome> {
  try {
    if (input.plnAmount === null || !Number.isFinite(input.plnAmount) || input.plnAmount <= 0) {
      return { fired: false, reason: "unknown_amount" };
    }

    // findFirst, not the (nullable) unique: Postgres treats NULLs as distinct, so the founder row is
    // not addressable through `tenantId @unique`.
    const cfg = await prisma.penaltyConfig.findFirst({ where: { tenantId: tenantId ?? null } }).catch(() => null);
    if (!cfg?.enabled) return { fired: false, reason: "disabled" };
    if (input.plnAmount * 100 < cfg.minPlnGrosze) return { fired: false, reason: "below_minimum" };

    const rows = await prisma.penalty
      .findMany({ where: { tenantId: tenantId ?? null, enabled: true }, orderBy: { sortOrder: "asc" } })
      .catch(() => []);
    const pool = eligiblePenalties(rows.map(toSpec), input.plnAmount);
    if (pool.length === 0) return { fired: false, reason: "no_pool" };

    const now = new Date();
    // The queue is derived from the rows themselves rather than a mutable counter, so a crashed run
    // cannot leave the portal permanently "busy".
    const upcoming = await prisma.penaltyDraw
      .findMany({
        where: { tenantId: tenantId ?? null, startsAt: { gte: new Date(now.getTime() - 60_000) } },
        orderBy: { startsAt: "desc" },
        select: { startsAt: true, durationMs: true },
      })
      .catch(() => []);

    const last = upcoming[0] ?? null;
    if (!canFireNow(last ? last.startsAt : null, cfg.cooldownMs, now)) {
      // Not a hard refusal — the queue below decides when it may start instead.
      log.debug("cooldown active, queueing", { tenantId });
    }
    const busyUntil = last ? new Date(last.startsAt.getTime() + last.durationMs) : null;
    const startsAt = queueSlot(busyUntil, cfg.cooldownMs, now, upcoming.length);
    if (!startsAt) return { fired: false, reason: "queue_full" };

    const draw = drawPenalty(pool, cryptoRng);
    if (!draw) return { fired: false, reason: "no_pool" };

    const index = pool.findIndex((p) => p.id === draw.penaltyId);
    const row = rows.find((r) => r.id === draw.penaltyId);

    const created = await prisma.penaltyDraw.create({
      data: {
        tenantId: tenantId ?? null,
        penaltyId: draw.penaltyId,
        // Snapshot the label and the index: the catalogue can be edited after the draw, and the
        // WheelSpin precedent shows resolving by label later is ambiguous.
        penaltyLabel: row?.label ?? "?",
        penaltyIndex: index,
        intensity: draw.intensity,
        durationMs: draw.durationMs,
        donationId: input.donationId ?? null,
        amountGrosze: input.amountGrosze,
        currency: input.currency,
        donorName: input.donorName,
        startsAt,
      },
      select: { id: true },
    });

    log.info("penalty drawn", { tenantId, label: row?.label, intensity: draw.intensity, durationMs: draw.durationMs });
    return { fired: true, drawId: created.id, label: row?.label ?? "?", intensity: draw.intensity, durationMs: draw.durationMs, startsAt };
  } catch (e) {
    // A penalty is entertainment layered on top of a donation that is already banked. It must never
    // be able to fail the donation, so everything is swallowed here and only logged.
    log.warn("penalty run failed", { error: e instanceof Error ? e.message : String(e) });
    return { fired: false, reason: "disabled" };
  }
}
