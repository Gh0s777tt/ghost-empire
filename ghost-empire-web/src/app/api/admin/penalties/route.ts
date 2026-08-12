// src/app/api/admin/penalties/route.ts
// The streamer's control surface for "kary" (#806): the per-portal switch, the amount floor, the
// cooldown, and the catalogue of drawable penalties + the recent draw history.
//
// ⚠️ ENABLING IS THE LEGAL GATE. `enabled` defaults to false and this route is the only way to flip
// it. Paying real money for a RANDOM outcome is structurally what art. 2 ust. 5 describes (even though
// the payer wins nothing), and the question is open in docs/CHIPS-CASINO.md — so the response carries
// `legalWarning` and the panel shows it next to the switch. We do not block the owner from turning it
// on; we make sure they cannot do it without being told.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin";
import { currentTenantId } from "@/lib/tenant";
import { logAdminAction } from "@/lib/audit";
import { validateIntensityAction, validateObsAction, OBS_ACTION_KINDS, INTENSITY_SCALE_MAX } from "@/lib/obs-rules";
import { DURATION_MIN_MS, DURATION_MAX_MS, MAX_QUEUE_DEPTH } from "@/lib/penalties";
import { createLogger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const log = createLogger("admin.penalties");

/** Every kind a penalty may use — the three storable rule kinds, the intensity one, plus the
 *  free-text "challenge" (update 2026-08): NIE aktuuje OBS, tylko WYŚWIETLA `label` jako wyzwanie
 *  ("zrób X") w źródle OBS-control. Streamer robi to ręcznie. Idzie tym samym at-most-once
 *  kanałem co reszta kar — patrz obs-control/penalties + ObsControlClient. */
const PENALTY_ACTION_KINDS = [...OBS_ACTION_KINDS, "set_filter_intensity", "challenge"] as const;

const LEGAL_WARNING =
  "Kary losowane za REALNE wpłaty to pytanie otwarte u prawnika (art. 2 ust. 5 — gra komercyjna + losowość, " +
  "choć płacący nic nie wygrywa). Nie włączaj tego na produkcji przed odpowiedzią. Bezpieczny wariant: " +
  "wpłata odpala karę WSKAZANĄ progiem, a losowanie zostaje przy żetonach.";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const tid = await currentTenantId();

  const [config, penalties, draws] = await Promise.all([
    prisma.penaltyConfig.findFirst({ where: { tenantId: tid ?? null } }).catch(() => null),
    prisma.penalty.findMany({ where: { tenantId: tid ?? null }, orderBy: { sortOrder: "asc" } }).catch(() => []),
    prisma.penaltyDraw
      .findMany({ where: { tenantId: tid ?? null }, orderBy: { drawnAt: "desc" }, take: 25 })
      .catch(() => []),
  ]);

  return NextResponse.json({
    // Defaults mirror the schema so the panel renders sensibly before a config row exists.
    config: config ?? { enabled: false, minPlnGrosze: 2000, cooldownMs: 30_000 },
    penalties,
    draws,
    limits: { intensityMax: INTENSITY_SCALE_MAX, durationMinMs: DURATION_MIN_MS, durationMaxMs: DURATION_MAX_MS, maxQueue: MAX_QUEUE_DEPTH },
    actionKinds: PENALTY_ACTION_KINDS,
    legalWarning: LEGAL_WARNING,
  });
}

type Body = {
  action?: "saveConfig" | "savePenalty" | "deletePenalty";
  enabled?: unknown;
  minPlnGrosze?: unknown;
  cooldownMs?: unknown;
  penalty?: Record<string, unknown>;
  id?: unknown;
};

const int = (v: unknown, fallback: number, lo: number, hi: number): number => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(Math.max(n, lo), hi) : fallback;
};

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const tid = await currentTenantId();

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.action === "saveConfig") {
    const enabled = body.enabled === true;
    const data = {
      enabled,
      // Floor the minimum at 1 zł: a 1-grosz donation drawing a stream effect is an abuse vector, not
      // a feature, and the queue cap alone would not stop a flood of them.
      minPlnGrosze: int(body.minPlnGrosze, 2000, 100, 10_000_000),
      cooldownMs: int(body.cooldownMs, 30_000, 0, 600_000),
    };
    // findFirst + explicit branch, not upsert: `tenantId` is a NULLABLE unique, and Postgres treats
    // NULLs as distinct, so upsert cannot address the founder row.
    const existing = await prisma.penaltyConfig.findFirst({ where: { tenantId: tid ?? null }, select: { id: true, enabled: true } }).catch(() => null);
    try {
      if (existing) await prisma.penaltyConfig.update({ where: { id: existing.id }, data });
      else await prisma.penaltyConfig.create({ data: { tenantId: tid ?? null, ...data } });
    } catch (e) {
      log.error("saving penalty config failed", e);
      return NextResponse.json({ error: "Nie udało się zapisać (czy migracja tabel kar jest wgrana?)" }, { status: 500 });
    }
    // Turning this ON is the decision with legal weight, so it is audited explicitly.
    if (enabled && !existing?.enabled) {
      await logAdminAction({ adminId: auth.userId, action: "update_integrations", targetType: "penalty_config", details: { enabled: true, tenantId: tid ?? null } }).catch(() => {});
    }
    return NextResponse.json({ ok: true, legalWarning: enabled ? LEGAL_WARNING : null });
  }

  if (body.action === "deletePenalty") {
    const id = typeof body.id === "string" ? body.id : "";
    if (!id) return NextResponse.json({ error: "Brak id" }, { status: 400 });
    // Scope the delete to THIS portal so one admin cannot remove another portal's catalogue entry.
    const del = await prisma.penalty.deleteMany({ where: { id, tenantId: tid ?? null } }).catch(() => ({ count: 0 }));
    return NextResponse.json({ ok: del.count > 0 });
  }

  if (body.action !== "savePenalty" || !body.penalty) {
    return NextResponse.json({ error: "action: saveConfig | savePenalty | deletePenalty" }, { status: 400 });
  }

  const p = body.penalty;
  const label = typeof p.label === "string" ? p.label.trim().slice(0, 120) : "";
  if (!label) return NextResponse.json({ error: "Kara musi mieć nazwę — widzowie ją widzą na liście" }, { status: 400 });

  const kind = typeof p.actionKind === "string" ? p.actionKind : "";
  if (!(PENALTY_ACTION_KINDS as readonly string[]).includes(kind)) {
    return NextResponse.json({ error: `actionKind: ${PENALTY_ACTION_KINDS.join(" | ")}` }, { status: 400 });
  }

  // "challenge" (update 2026-08): free-text wyzwanie bez akcji OBS — pomija walidację efektu,
  // wszystkie pola OBS zostają null; liczy się tylko `label` (tekst) + pasmo czasu (jak długo
  // pokazać). Reszta kindów: walidacja TYMI SAMYMI walidatorami co reguły OBS, żeby kara nie
  // opisała akcji, na której aktuator by się wywalił.
  const effect =
    kind === "challenge"
      ? null
      : kind === "set_filter_intensity"
        ? validateIntensityAction({ ...p, kind, intensity: 1, revertAfterMs: null })
        : validateObsAction({ ...p, kind, revertAfterMs: null });
  if (effect && !effect.ok) return NextResponse.json({ error: effect.error }, { status: 400 });
  const ev = effect && effect.ok ? effect.value : null;

  const minIntensity = int(p.minIntensity, 1, 1, INTENSITY_SCALE_MAX);
  const minDurationMs = int(p.minDurationMs, 3_000, DURATION_MIN_MS, DURATION_MAX_MS);
  const data = {
    label,
    enabled: p.enabled !== false,
    weight: int(p.weight, 10, 0, 1_000_000),
    minPlnGrosze: int(p.minPlnGrosze, 0, 0, 10_000_000),
    minIntensity,
    // Keep the band ordered on the way in as well as at draw time: the pure layer clamps an inverted
    // band, but storing one would make the panel show something the draw does not do.
    maxIntensity: int(p.maxIntensity, minIntensity, minIntensity, INTENSITY_SCALE_MAX),
    minDurationMs,
    maxDurationMs: int(p.maxDurationMs, minDurationMs, minDurationMs, DURATION_MAX_MS),
    actionKind: kind,
    scene: ev && "scene" in ev ? ev.scene : null,
    source: ev && "source" in ev ? ev.source : null,
    filter: ev && "filter" in ev ? ev.filter : null,
    setting: ev?.kind === "set_filter_intensity" ? ev.setting : null,
    rangeMin: ev?.kind === "set_filter_intensity" ? ev.min : null,
    rangeMax: ev?.kind === "set_filter_intensity" ? ev.max : null,
    targetState:
      ev?.kind === "toggle_source" ? ev.visible
      : ev?.kind === "toggle_filter" ? ev.enabled
      : null,
    sortOrder: int(p.sortOrder, 0, 0, 9_999),
  };

  try {
    const id = typeof p.id === "string" && p.id ? p.id : null;
    if (id) {
      // tenant-scoped update: updateMany with the tenant in the WHERE, so a foreign id is a no-op
      // rather than an edit of someone else's row.
      const upd = await prisma.penalty.updateMany({ where: { id, tenantId: tid ?? null }, data });
      if (upd.count === 0) return NextResponse.json({ error: "Nie znaleziono kary" }, { status: 404 });
    } else {
      await prisma.penalty.create({ data: { tenantId: tid ?? null, ...data } });
    }
  } catch (e) {
    log.error("saving penalty failed", e);
    return NextResponse.json({ error: "Nie udało się zapisać (czy migracja tabel kar jest wgrana?)" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
