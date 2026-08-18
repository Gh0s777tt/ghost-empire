// src/app/api/obs-control/penalties/route.ts
// Delivers DUE penalty draws to the in-OBS actuator (#806).
//
// WHY THIS IS NOT THE ALERT FEED. The actuator's existing transport (`/api/alerts/queue`) is the alert
// overlay's feed, so it respects `AlertTypeConfig.minAmount` — an alert hidden from the overlay never
// reaches the actuator either. That is fine for a decorative rule and unacceptable here: a viewer PAID
// for the penalty, so an unrelated display threshold must not be able to swallow it. This endpoint
// serves the drawn rows directly and applies no display filtering of any kind.
//
// DELIVERY IS AT-MOST-ONCE. A row is stamped `appliedAt` as it is handed over, so closing or
// refreshing the browser source cannot replay effects that already ran. The cost is the opposite
// failure: a draw handed to a source that dies before actuating is lost. That is the right way round —
// a duplicated effect hijacks the stream, while a missed one is visible to the streamer as a row with
// `appliedAt` set but nothing seen, and the panel lists it so they can re-fire it by hand.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isValidOverlayToken } from "@/lib/alerts";
import { currentTenantId } from "@/lib/tenant";
import { penaltyAction } from "@/lib/penalties-run";
import { createLogger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const log = createLogger("obs.penalties");

/** How many due draws to hand over in one poll. A backlog drains over the next few ticks. */
const MAX_PER_POLL = 3;

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token");
  const tenantId = await currentTenantId();
  if (!(await isValidOverlayToken(token, tenantId))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  // `.catch` so a portal whose penalty tables do not exist yet gets an empty list, not a 500.
  const due = await prisma.penaltyDraw
    .findMany({
      where: { tenantId: tenantId ?? null, appliedAt: null, startsAt: { lte: now } },
      orderBy: { startsAt: "asc" },
      take: MAX_PER_POLL,
    })
    .catch(() => []);

  if (due.length === 0) return NextResponse.json({ penalties: [] });

  // Load the catalogue rows the draws point at, in one query — the effect columns live there, not on
  // the draw (a draw records WHAT was drawn, the catalogue records HOW to actuate it).
  const ids = [...new Set(due.map((d) => d.penaltyId).filter((x): x is string => !!x))];
  const specs = ids.length
    ? await prisma.penalty.findMany({ where: { id: { in: ids } } }).catch(() => [])
    : [];
  const byId = new Map(specs.map((s) => [s.id, s]));

  const payload: Array<{ drawId: string; label: string; intensity: number; durationMs: number; action: unknown }> = [];
  for (const d of due) {
    // ⚠️ KLEPNIJ ZANIM PODASZ. Nagłówek tego pliku deklaruje at-most-once, ale do 2026-08 kod
    // budował payload z `due` i stemplował go DOPIERO NA KOŃCU jednym `updateMany` BEZ warunku
    // `appliedAt: null`. Dwa równoległe odpytania — dwa źródła OBS, odświeżenie strony, retry —
    // obie widziały ten sam nierozdany wiersz i obie go dostawały. Skutek: kara, za którą widz
    // ZAPŁACIŁ, wykonywała się na wizji dwa razy.
    //
    // `appliedAt: null` w WHERE sprawia, że `updateMany` blokuje wiersz i rozstrzyga wyścig:
    // przegrany dostaje `count === 0` i po prostu tej kary nie otrzymuje. Ten sam idiom, co
    // atomowy claim rozstrzygnięcia predykcji (`lib/predictions.ts`) — tam chroni przed podwójną
    // wypłatą, tu przed podwójnym wykonaniem.
    const claim = await prisma.penaltyDraw
      .updateMany({ where: { id: d.id, appliedAt: null }, data: { appliedAt: now } })
      .catch(() => ({ count: 0 }));
    if (claim.count === 0) continue; // inny poll był pierwszy — to NIE jest nasza kara

    const spec = d.penaltyId ? byId.get(d.penaltyId) : undefined;
    // "challenge" (update 2026-08): free-text wyzwanie — brak akcji OBS, dostarczamy marker
    // {kind:"challenge"}, a źródło OBS-control pokaże `label` jako banner zamiast aktuować OBS.
    // Idzie tym samym at-most-once kanałem (stampowanie niżej obejmuje i te wiersze).
    const action = spec
      ? spec.actionKind === "challenge"
        ? { kind: "challenge" as const }
        : penaltyAction(spec, d.intensity, d.durationMs)
      : null;
    if (!action) {
      // Wiersz katalogu skasowany albo niekompletny. Jest już OSTEMPLOWANY przez claim wyżej,
      // więc przestaje być podawany co 2 sekundy w kółko — ciche ponawianie nieaktuowalnego
      // losowania to gorąca pętla.
      log.warn("undeliverable draw, marking applied", { drawId: d.id, penaltyId: d.penaltyId });
      continue;
    }
    payload.push({ drawId: d.id, label: d.penaltyLabel, intensity: d.intensity, durationMs: d.durationMs, action });
  }

  return NextResponse.json({ penalties: payload });
}
