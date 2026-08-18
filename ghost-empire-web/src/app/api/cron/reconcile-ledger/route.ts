// src/app/api/cron/reconcile-ledger/route.ts
// Vercel Cron — nightly double-entry audit of the token economy. For every portal it checks the
// invariant  Σ User balance == Σ Transaction.amount  for BOTH wallets (GT + CHIPS), and alerts
// that portal's admins when the balance and the ledger disagree (an unjournaled mint/burn).
//
// WHY. There is no central credit/debit API — ~45 code paths each pair `user.update({ tokens })`
// with a hand-written `transaction.create(...)` by CONVENTION, not by type enforcement. One path
// that moves a balance without a matching ledger row (or the reverse) silently breaks the books
// and mints real currency from nowhere; nothing else in the system would ever notice. This cron is
// the cheap safety net over the whole economy. Pure decision logic lives in @/lib/reconcile.
//
// COST. It reads the per-user ledger sums (`groupBy(userId,currency)`) and the user balances in TWO
// queries total (no per-tenant fan-out) and aggregates per portal in memory — so tenant A's drift
// can't cancel tenant B's the way a single global sum would hide it. At today's scale that in-memory
// join is fine; if the platform grows past comfortably-in-memory this should move to a SQL rollup
// or a materialized per-user ledger balance. Runs off-peak (06:00 UTC).
//
// ALERTS ARE DEDUPED. A stable pre-existing baseline drift is reported ONCE (first sight) and then
// stays quiet until it actually changes — the previous run's per-portal drift is cached in Redis
// (`reconcile:lastdrift`). Without Redis (local/dev) dedup is skipped; there is no cron there anyway.
import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { createLogger } from "@/lib/logger";
import { verifyCronSecret } from "@/lib/utils";
import { currencyDrift, shouldAlert, findOffenders, driftSummary, type CurrencyDrift } from "@/lib/reconcile";

export const dynamic = "force-dynamic";

const log = createLogger("cron.reconcile");

const NULL_BUCKET = "__null__"; // portal key for users with tenantId = null (legacy/single-tenant)
const SNAPSHOT_KEY = "reconcile:lastdrift";
const SNAPSHOT_TTL_MS = 45 * 24 * 60 * 60 * 1000; // 45d — a portal idle longer than that self-evicts
const OFFENDERS_TOP_N = 10;

/** Per-run drift snapshot persisted to Redis for next-run dedup: portalKey → { GT, CHIPS } drift. */
type Snapshot = Record<string, { GT: number; CHIPS: number }>;

export async function GET(req: Request) {
  if (!verifyCronSecret(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Two reads cover the whole platform: signed ledger sum per (user, currency), and every user's
    // stored balances + which portal they belong to. Everything else is in-memory aggregation.
    const [ledgerRows, users, tenants] = await Promise.all([
      prisma.transaction.groupBy({ by: ["userId", "currency"], _sum: { amount: true } }),
      prisma.user.findMany({ select: { id: true, tenantId: true, tokens: true, chips: true } }),
      prisma.tenant.findMany({ select: { id: true, name: true } }),
    ]);

    const tenantName = new Map<string, string>(tenants.map((t) => [t.id, t.name]));
    const keyOf = (tenantId: string | null) => tenantId ?? NULL_BUCKET;

    // userId → portal key, and per-user ledger balances split by currency (also feed the offenders drill).
    const userTenant = new Map<string, string>();
    const balGt = new Map<string, number>();
    const balChips = new Map<string, number>();
    for (const u of users) {
      const k = keyOf(u.tenantId);
      userTenant.set(u.id, k);
      balGt.set(u.id, u.tokens);
      balChips.set(u.id, u.chips);
    }
    const ledGt = new Map<string, number>();
    const ledChips = new Map<string, number>();
    for (const r of ledgerRows) {
      const amt = r._sum.amount ?? 0;
      // currency defaults to "GT" (non-nullable, legacy rows read as GT); anything not CHIPS is GT.
      if (r.currency === "CHIPS") ledChips.set(r.userId, (ledChips.get(r.userId) ?? 0) + amt);
      else ledGt.set(r.userId, (ledGt.get(r.userId) ?? 0) + amt);
    }

    // Roll per-user figures up to per-portal totals.
    type Totals = { gtBal: number; gtLed: number; chipsBal: number; chipsLed: number };
    const portal = new Map<string, Totals>();
    const bump = (k: string): Totals => {
      let t = portal.get(k);
      if (!t) { t = { gtBal: 0, gtLed: 0, chipsBal: 0, chipsLed: 0 }; portal.set(k, t); }
      return t;
    };
    for (const u of users) {
      const t = bump(keyOf(u.tenantId));
      t.gtBal += u.tokens;
      t.chipsBal += u.chips;
    }
    for (const [userId, amt] of ledGt) bump(userTenant.get(userId) ?? NULL_BUCKET).gtLed += amt;
    for (const [userId, amt] of ledChips) bump(userTenant.get(userId) ?? NULL_BUCKET).chipsLed += amt;

    const last = (redis ? await redis.get<Snapshot>(SNAPSHOT_KEY).catch(() => null) : null) ?? {};
    const snapshot: Snapshot = {};
    const report: Array<{ portal: string; name: string; gt: CurrencyDrift; chips: CurrencyDrift; alerted: boolean }> = [];
    let alertedPortals = 0;

    for (const [k, t] of portal) {
      // Dyskryminant enuma `ReconcileCurrency` (klucz migawki Redis i `offenders`), NIE nazwa waluty
      // portalu — etykieta dla człowieka powstaje w `driftSummary` i wychodzi jako marker `%gt%`.
      const gt = currencyDrift("GT", t.gtBal, t.gtLed); // wl-ok: dyskryminant enuma, nie etykieta
      const chips = currencyDrift("CHIPS", t.chipsBal, t.chipsLed);
      snapshot[k] = { GT: gt.drift, CHIPS: chips.drift };

      const prev = last[k] ?? { GT: null, CHIPS: null };
      const alertGt = shouldAlert(gt.drift, prev.GT ?? null);
      const alertChips = shouldAlert(chips.drift, prev.CHIPS ?? null);
      const alerted = alertGt || alertChips;
      const name = k === NULL_BUCKET ? "(legacy / bez portalu)" : tenantName.get(k) ?? k;

      if (gt.drift !== 0 || chips.drift !== 0) {
        // Log every drift each run (operational trail); the Redis dedup only gates the noisy
        // admin Notification + Sentry, not the log line.
        log.warn("ledger drift", { portal: k, name, gtDrift: gt.drift, chipsDrift: chips.drift, alerted });
      }

      if (alerted) {
        alertedPortals++;
        const driftingRows = [gt, chips];
        const summary = driftSummary(driftingRows);

        // Offenders drill, in-memory over the users we already loaded — worst |drift| first, capped.
        const usersOfPortal = users.filter((u) => keyOf(u.tenantId) === k).map((u) => u.id);
        const idSet = new Set(usersOfPortal);
        const pick = (m: Map<string, number>) => new Map([...m].filter(([id]) => idSet.has(id)));
        const offenders = {
          GT: alertGt ? findOffenders(pick(balGt), pick(ledGt), OFFENDERS_TOP_N) : [],
          CHIPS: alertChips ? findOffenders(pick(balChips), pick(ledChips), OFFENDERS_TOP_N) : [],
        };

        // Notify THIS portal's admins only (mirror economy-anomaly): the alert is per-tenant, and an
        // unscoped fan-out would show a foreign portal's admins another portal's numbers.
        const admins = await prisma.user.findMany({
          where: { isAdmin: true, ...(k === NULL_BUCKET ? { tenantId: null } : { tenantId: k }) },
          select: { id: true },
        });
        if (admins.length > 0) {
          await prisma.notification.createMany({
            data: admins.map((a) => ({
              userId: a.id,
              type: "system",
              title: "🧮 Rozjazd księgi ekonomii",
              message: `Saldo nie zgadza się z historią transakcji — ${summary}. Sprawdź panel ekonomii.`,
              icon: "🧮",
              link: "/admin#economy",
            })),
          });
        }
        Sentry.captureMessage("reconcile-ledger: balance/ledger drift", {
          level: "error",
          tags: { cron: "reconcile-ledger", portal: k },
          extra: { name, gtDrift: gt.drift, chipsDrift: chips.drift, offenders },
        });
        log.error("ledger drift ALERT", { portal: k, name, summary, offenders });
      }

      report.push({ portal: k, name, gt, chips, alerted });
    }

    if (redis) {
      try { await redis.set(SNAPSHOT_KEY, snapshot, { px: SNAPSHOT_TTL_MS }); }
      catch { /* snapshot write best-effort — a miss just means next run re-alerts an unchanged drift */ }
    }

    const driftingPortals = report.filter((r) => r.gt.drift !== 0 || r.chips.drift !== 0).length;
    log.info("reconcile complete", { portals: report.length, driftingPortals, alertedPortals });
    // Non-2xx when anything drifts so Vercel/uptime flags the run even if no admin reads the bell.
    return NextResponse.json(
      { ok: driftingPortals === 0, portals: report.length, driftingPortals, alertedPortals, report },
      { status: driftingPortals === 0 ? 200 : 500 },
    );
  } catch (e) {
    log.error("reconcile failed", e);
    Sentry.captureException(e, { tags: { cron: "reconcile-ledger" } });
    return NextResponse.json({ error: "reconcile_failed" }, { status: 500 });
  }
}
