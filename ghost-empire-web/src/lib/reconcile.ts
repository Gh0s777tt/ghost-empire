// src/lib/reconcile.ts
// Pure ledger-reconciliation math — no DB, no side effects (repo convention: pure logic is
// unit-tested without mocks; the request/DB side lives in the cron route).
//
// WHY THIS EXISTS. The platform has NO central "credit/debit" API: ~45 code paths each do their
// own `user.update({ tokens: { increment } })` next to a hand-written `transaction.create(...)`
// inside their own `$transaction`. Pairing the balance move with a ledger row is a CONVENTION, not
// a type-enforced invariant — so a single path that moves `User.tokens`/`User.chips` WITHOUT
// writing a matching `Transaction` (or the reverse) silently breaks the books, mints value from
// nowhere, and nobody notices until a viewer has a million GT out of thin air. Casino chips are
// journaled the same way (every bet writes a `currency:"CHIPS"` row), so the same invariant holds
// for both wallets.
//
// THE INVARIANT (per user, per currency, per portal):
//     User balance  ==  Σ Transaction.amount        (signed: + earn, − spend)
// i.e. GT:    Σ users.tokens  == Σ amount where currency="GT"
//      CHIPS: Σ users.chips   == Σ amount where currency="CHIPS"
// `drift = balance − ledger`; drift == 0 means the books are consistent. Any nonzero drift is a
// real correctness signal (an unjournaled mint/burn), surfaced to that portal's admins.
//
// Alerts are DEDUPED against the previous run (Redis snapshot) so a stable pre-existing baseline
// drift is reported ONCE, not every night — only a NEW or CHANGED drift re-alerts. See the cron
// at src/app/api/cron/reconcile-ledger/route.ts.

/** The two independent economies. GT is the real, earnable currency; CHIPS is the free casino loop. */
export type ReconcileCurrency = "GT" | "CHIPS";

/**
 * One currency's reconciliation result for one portal.
 *
 * @property currency Which wallet this row is about.
 * @property balance  Σ of the users' stored balance (`tokens` for GT, `chips` for CHIPS).
 * @property ledger   Σ of `Transaction.amount` for that currency (signed).
 * @property drift    `balance − ledger`. **0 = healthy.** Nonzero = the balance and the ledger
 *   disagree, i.e. some path moved money without a matching ledger row (or vice versa).
 */
export type CurrencyDrift = {
  currency: ReconcileCurrency;
  balance: number;
  ledger: number;
  drift: number;
};

/**
 * Build a {@link CurrencyDrift} from the two aggregate sums. Coalesces nullish sums to 0 (Prisma
 * `_sum` is `null` when nothing matched) so an empty portal reconciles cleanly as `drift: 0`.
 */
export function currencyDrift(
  currency: ReconcileCurrency,
  balance: number | null | undefined,
  ledger: number | null | undefined,
): CurrencyDrift {
  const b = balance ?? 0;
  const l = ledger ?? 0;
  return { currency, balance: b, ledger: l, drift: b - l };
}

/**
 * Should this drift raise an admin alert now?
 *
 * True only when the drift is **nonzero** AND **new or changed** since the last run — so a stable
 * baseline drift alerts once (first sight: `last === null`) and then goes quiet until it actually
 * moves. A drift that returns to 0 does not alert (the caller still logs the recovery).
 *
 * @param drift     Current drift for this portal+currency.
 * @param lastDrift Drift recorded on the previous run, or `null` if never seen (first run / no cache).
 */
export function shouldAlert(drift: number, lastDrift: number | null): boolean {
  if (drift === 0) return false;
  return lastDrift === null || drift !== lastDrift;
}

/**
 * One user's contribution to a portal's drift, for the "top offenders" breakdown that runs only
 * when a portal is already known to drift.
 */
export type UserDrift = { userId: string; balance: number; ledger: number; drift: number };

/**
 * Find the users whose stored balance disagrees with their own ledger sum, worst first.
 *
 * Considers the UNION of both maps' keys: a user present only in `balances` (balance but no ledger
 * rows) or only in `ledger` (ledger rows but a zeroed/absent balance) is exactly the kind of
 * inconsistency worth surfacing, so neither side is dropped.
 *
 * @param balances Map userId → stored balance (`tokens` or `chips`).
 * @param ledger   Map userId → Σ of that user's `Transaction.amount` for the currency.
 * @param topN     Cap on returned rows (worst by absolute drift).
 * @returns Users with `drift !== 0`, sorted by `|drift|` descending, capped at `topN`.
 */
export function findOffenders(
  balances: Map<string, number>,
  ledger: Map<string, number>,
  topN: number,
): UserDrift[] {
  const ids = new Set<string>([...balances.keys(), ...ledger.keys()]);
  const out: UserDrift[] = [];
  for (const userId of ids) {
    const b = balances.get(userId) ?? 0;
    const l = ledger.get(userId) ?? 0;
    const drift = b - l;
    if (drift !== 0) out.push({ userId, balance: b, ledger: l, drift });
  }
  out.sort((a, b) => Math.abs(b.drift) - Math.abs(a.drift));
  return out.slice(0, topN);
}

/**
 * One-line Polish summary of a portal's drifting currencies, for the admin `Notification` body.
 * Only nonzero-drift rows are mentioned; returns `""` when everything reconciles (caller skips the
 * alert on empty).
 */
export function driftSummary(rows: CurrencyDrift[]): string {
  return rows
    .filter((r) => r.drift !== 0)
    .map((r) => `${r.currency}: saldo ${r.balance.toLocaleString("pl-PL")} vs ledger ${r.ledger.toLocaleString("pl-PL")} (dryf ${r.drift > 0 ? "+" : ""}${r.drift.toLocaleString("pl-PL")})`)
    .join(" · ");
}
