// src/lib/wheel.ts
// Wheel of Fortune (Koło Fortuny). Viewers spend Ghost Tokens to spin a weighted
// wheel and win GT back. Config (cost + segments) is a singleton; each spin is
// recorded in WheelSpin and drives the /overlay/wheel animation. The token math
// runs in a single transaction so a spin can never charge without recording, or
// reward without charging.
import { prisma } from "@/lib/prisma";
import { pickWeightedIndex } from "@/lib/economy";
import { cryptoRng } from "@/lib/secure-rng";
import { fireOutgoingWebhooks } from "@/lib/webhooks-out";
import { currentTenantId } from "@/lib/tenant";

export type WheelSegment = {
  label: string;
  weight: number;       // relative probability (>0)
  rewardTokens: number; // GT won when landed on (0 = no reward)
  color: string;        // hex for the overlay slice
};

// Sensible starter wheel — house-favoured but with a juicy jackpot.
export const DEFAULT_SEGMENTS: WheelSegment[] = [
  { label: "Pudło", weight: 40, rewardTokens: 0, color: "#3f3f46" },
  { label: "50 🪙", weight: 25, rewardTokens: 50, color: "#6366f1" },
  { label: "100 🪙", weight: 18, rewardTokens: 100, color: "#8b5cf6" },
  { label: "250 🪙", weight: 10, rewardTokens: 250, color: "#ec4899" },
  { label: "500 🪙", weight: 5, rewardTokens: 500, color: "#f59e0b" },
  { label: "JACKPOT 1000 🪙", weight: 2, rewardTokens: 1000, color: "#10b981" },
];

export class WheelError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

/** Coerce a stored/incoming segments blob into a safe WheelSegment[]. */
export function parseSegments(raw: unknown): WheelSegment[] {
  if (!Array.isArray(raw)) return DEFAULT_SEGMENTS;
  const out: WheelSegment[] = [];
  for (const s of raw) {
    if (!s || typeof s !== "object") continue;
    const rec = s as Record<string, unknown>;
    const label = String(rec.label ?? "").trim().slice(0, 40);
    const weight = Math.max(0, Math.floor(Number(rec.weight) || 0));
    const rewardTokens = Math.max(0, Math.min(1_000_000, Math.floor(Number(rec.rewardTokens) || 0)));
    const color = typeof rec.color === "string" && /^#[0-9a-fA-F]{3,8}$/.test(rec.color) ? rec.color : "#6366f1";
    if (label && weight > 0) out.push({ label, weight, rewardTokens, color });
  }
  // Need at least 2 valid segments to make a wheel; otherwise fall back to defaults.
  return out.length >= 2 ? out.slice(0, 12) : DEFAULT_SEGMENTS;
}

/**
 * Resolve which slice a recorded spin landed on. Prefers the persisted
 * `segmentIndex` — the authoritative slice the spin actually picked, and the ONLY
 * reliable source when several segments share a label (a common way to shape wheel
 * odds). Falls back to a label lookup for legacy rows written before the index was
 * stored (segmentIndex null), or when the config changed since the spin so the
 * stored index is now out of range. Returns -1 when nothing matches. Pure — unit
 * tested; the overlay feed (lib/overlay-feeds.ts) is the caller.
 */
export function resolveLandingIndex(
  segments: { label: string }[],
  storedIndex: number | null | undefined,
  segmentLabel: string,
): number {
  if (storedIndex != null && storedIndex >= 0 && storedIndex < segments.length) return storedIndex;
  return segments.findIndex((s) => s.label === segmentLabel);
}

export type WheelConfigView = { enabled: boolean; costPerSpin: number; segments: WheelSegment[] };

/** Per-tenant wheel config row (get-or-create); legacy id:"default" when no tenant. */
export async function getWheelConfigRow(tenantId?: string | null) {
  // undefined → resolve from the request Host; explicit value → use it (the
  // overlay SSE tick runs outside a request scope and threads the tenant in).
  const tid = tenantId === undefined ? await currentTenantId() : tenantId;
  if (tid) {
    const existing = await prisma.wheelConfig.findFirst({ where: { tenantId: tid } });
    return existing ?? (await prisma.wheelConfig.create({ data: { tenantId: tid } }));
  }
  return prisma.wheelConfig.upsert({ where: { id: "default" }, create: { id: "default" }, update: {} });
}

export async function getWheelConfig(tenantId?: string | null): Promise<WheelConfigView> {
  const c = await getWheelConfigRow(tenantId);
  return {
    enabled: c.enabled,
    costPerSpin: c.costPerSpin,
    segments: parseSegments(c.segments),
  };
}

export type SpinResult = {
  spinId: string;
  segmentIndex: number;
  segmentLabel: string;
  rewardTokens: number;
  cost: number;
  net: number;       // rewardTokens - cost
  newBalance: number;
  actorName: string;
  actorImage: string | null;
};

/** Charge a spin, pick a weighted segment, grant any reward, record it — atomically. */
export async function spinWheel(userId: string): Promise<SpinResult> {
  const cfg = await getWheelConfig();
  if (!cfg.enabled) throw new WheelError("Koło Fortuny jest aktualnie wyłączone", 403);
  if (cfg.segments.length < 2) throw new WheelError("Koło nie jest skonfigurowane", 409);

  // CSPRNG — money path (grants rewardTokens); result must not be predictable from PRNG state.
  const idx = pickWeightedIndex(cfg.segments.map((s) => s.weight), cryptoRng());
  const seg = cfg.segments[idx];
  const cost = cfg.costPerSpin;

  const { spinId, balance, actorName, actorImage } = await prisma.$transaction(async (tx) => {
    // Charge atomically — only succeeds if the user can afford the spin.
    const charged = await tx.user.updateMany({
      where: { id: userId, chips: { gte: cost } },
      data: { chips: { decrement: cost } },
    });
    if (charged.count === 0) throw new WheelError("Za mało żetonów na zakręcenie", 402);

    await tx.transaction.create({
      data: { userId, type: "spend", amount: -cost, reason: "wheel:spin", currency: "CHIPS", status: "completed" },
    });

    if (seg.rewardTokens > 0) {
      await tx.user.update({
        where: { id: userId },
        data: { chips: { increment: seg.rewardTokens } },
      });
      await tx.transaction.create({
        data: { userId, type: "earn", amount: seg.rewardTokens, reason: `wheel:win:${seg.label}`.slice(0, 200), currency: "CHIPS", status: "completed" },
      });
    }

    const spin = await tx.wheelSpin.create({
      data: { userId, segmentIndex: idx, segmentLabel: seg.label, rewardTokens: seg.rewardTokens, cost },
      select: { id: true },
    });

    const fresh = await tx.user.findUnique({
      where: { id: userId },
      select: { chips: true, username: true, displayName: true, image: true },
    });

    return {
      spinId: spin.id,
      balance: fresh?.chips ?? 0,
      actorName: fresh?.displayName || fresh?.username || "Anon",
      actorImage: fresh?.image ?? null,
    };
  });

  // Notify external webhooks on a winning spin (best-effort, this portal only).
  if (seg.rewardTokens > 0) {
    const tid = await currentTenantId();
    fireOutgoingWebhooks("wheel_win", {
      title: "🎡 Wygrana w Kole Fortuny!",
      message: `${actorName} wygrał ${seg.rewardTokens} żetonów (${seg.label})`,
      actorName,
      amount: seg.rewardTokens,
      amountLabel: "żetony",
    }, tid);
  }

  return {
    spinId,
    segmentIndex: idx,
    segmentLabel: seg.label,
    rewardTokens: seg.rewardTokens,
    cost,
    net: seg.rewardTokens - cost,
    newBalance: balance,
    actorName,
    actorImage,
  };
}
