// src/lib/economy-collusion.ts
// Pure sockpuppet / collusion detectors for the GT economy — no DB, no side effects (repo
// convention: pure logic is unit-tested; the DB aggregation lives in /api/admin/economy-collusion).
//
// WHY. `economy-anomaly` only watches ADMIN grants. The whole USER-SIDE economy — referrals, P2P
// gifts, duels — is open to farming with multi-accounts (sockpuppets): fake accounts that claim
// referral bonuses, feed GT into one "main", or lose duels on purpose to funnel chips. Left
// unchecked this quietly inflates the token and poisons every leaderboard; for a white-label SaaS
// it is a per-portal reputation risk. These detectors surface the clearest patterns from the data
// we ALREADY have — no schema change — and hand admins a ranked list to review (v1 flags, no
// auto-punishment; holding/banning stays a human decision).
//
// DATA LIMITS (honest — documented so nobody thinks this is exhaustive):
//   • No IP / device-fingerprint is stored anywhere, so device-cluster detection is impossible
//     without adding tracking (a schema change). Not attempted here.
//   • Gift ledger rows record only ONE side (`gift_sent` on the sender, `gift_received` on the
//     recipient) with no link between them, so precise A→B→A gift-cycle graphs aren't recoverable —
//     only AGGREGATE concentration (who lives off gifts vs who feeds them). Precise cycles would
//     need a `counterpartyId` on the gift transaction (future).
//   • Duels DO carry both parties + the winner, so duel-collusion is precise.

/** Shared thresholds — exported so the API and tests use the same numbers (tune in one place). */
export const COLLUSION = {
  referral: { minReferred: 5, lowActivityRatio: 0.6 },
  duel: { minDuels: 6, minLopsided: 0.8 },
  gift: { minReceived: 2000, fedRatio: 0.7 },
} as const;

// ─── Referral stars ──────────────────────────────────────────────────────────
/** One referrer's aggregate: how many accounts they referred, and how many of those look inert. */
export type ReferrerRow = { referrerId: string; referredCount: number; lowActivityCount: number };
export type ReferralFlag = {
  referrerId: string;
  referredCount: number;
  lowActivityCount: number;
  score: number; // higher = more suspicious
  reasons: string[];
};

/**
 * Flag "referral stars": one account that referred MANY others, most of which are low-activity
 * (level ≤ 1, near-zero balance) — the signature of spun-up sockpuppets farmed for referral bonuses.
 * A big streamer with many genuine, ACTIVE referrals won't trip this because the low-activity RATIO
 * stays low. Score = low-activity referred count (the farmed-account count).
 */
export function flagReferralStars(
  rows: ReferrerRow[],
  opts: { minReferred: number; lowActivityRatio: number } = COLLUSION.referral,
): ReferralFlag[] {
  const out: ReferralFlag[] = [];
  for (const r of rows) {
    if (r.referredCount < opts.minReferred) continue;
    const ratio = r.referredCount > 0 ? r.lowActivityCount / r.referredCount : 0;
    if (ratio < opts.lowActivityRatio) continue;
    out.push({
      referrerId: r.referrerId,
      referredCount: r.referredCount,
      lowActivityCount: r.lowActivityCount,
      score: r.lowActivityCount,
      reasons: [`${r.referredCount} poleconych, w tym ${r.lowActivityCount} niemal nieaktywnych (${Math.round(ratio * 100)}%)`],
    });
  }
  return out.sort((a, b) => b.score - a.score);
}

// ─── Duel collusion ──────────────────────────────────────────────────────────
/** Aggregated resolved-duel stats for one UNORDERED pair (a < b by id). */
export type DuelPairRow = { a: string; b: string; total: number; aWins: number; bWins: number };
export type DuelFlag = {
  a: string;
  b: string;
  total: number;
  lopsidedness: number; // |aWins − bWins| / total, 0..1
  winner: string; // the account the chips flowed TO
  score: number;
  reasons: string[];
};

/**
 * Flag colluding duel pairs: two accounts that duel each other REPEATEDLY with a lopsided win split
 * — the signature of one account throwing duels to funnel chips into the other (wash-trading a bet
 * pool). Random genuine rivalry trends toward 50/50, so a 9-of-10 split over many duels is the tell.
 * Score = total × lopsidedness (both volume and skew matter).
 */
export function flagDuelCollusion(
  rows: DuelPairRow[],
  opts: { minDuels: number; minLopsided: number } = COLLUSION.duel,
): DuelFlag[] {
  const out: DuelFlag[] = [];
  for (const r of rows) {
    if (r.total < opts.minDuels) continue;
    const lopsidedness = r.total > 0 ? Math.abs(r.aWins - r.bWins) / r.total : 0;
    if (lopsidedness < opts.minLopsided) continue;
    const winner = r.aWins >= r.bWins ? r.a : r.b;
    out.push({
      a: r.a,
      b: r.b,
      total: r.total,
      lopsidedness,
      winner,
      score: r.total * lopsidedness,
      reasons: [`${r.total} dueli, wynik ${r.aWins}:${r.bWins} (skos ${Math.round(lopsidedness * 100)}%) — żetony płyną do jednego konta`],
    });
  }
  return out.sort((a, b) => b.score - a.score);
}

// ─── Gift concentration (aggregate — no counterparty link available) ─────────
/** One user's gift flows + how much they earned on their own. */
export type GiftUserRow = { userId: string; sent: number; received: number; earnedTotal: number };
export type GiftFlag = {
  userId: string;
  sent: number;
  received: number;
  earnedTotal: number;
  kind: "collector"; // account whose balance is mostly other people's gifts, not its own activity
  score: number;
  reasons: string[];
};

/**
 * Flag "gift collectors": accounts whose incoming gifts dwarf what they earned themselves — i.e. the
 * balance was assembled by OTHER accounts feeding it, not by real activity. That is the drain point
 * of a multi-account gift farm. Precise feeder→collector edges aren't recoverable (the ledger drops
 * the counterparty), so this is the aggregate signal; a follow-up that records `counterpartyId`
 * would let us draw the actual graph. Score = received / max(earned, 1).
 */
export function flagGiftConcentration(
  rows: GiftUserRow[],
  opts: { minReceived: number; fedRatio: number } = COLLUSION.gift,
): GiftFlag[] {
  const out: GiftFlag[] = [];
  for (const r of rows) {
    if (r.received < opts.minReceived) continue;
    // gifts must make up the majority of everything this account ever earned (activity + gifts)
    const ratio = r.received / Math.max(r.earnedTotal, 1);
    if (ratio < opts.fedRatio) continue;
    out.push({
      userId: r.userId,
      sent: r.sent,
      received: r.received,
      earnedTotal: r.earnedTotal,
      kind: "collector",
      score: ratio,
      reasons: [`otrzymał ${r.received.toLocaleString("pl-PL")} GT w prezentach = ${Math.round(ratio * 100)}% całości zarobku — konto zasilane przez innych`],
    });
  }
  return out.sort((a, b) => b.score - a.score);
}

/** Canonical unordered pair key (smaller id first) — so A-vs-B and B-vs-A aggregate together. */
export function pairKey(x: string, y: string): { a: string; b: string; key: string } {
  const [a, b] = x < y ? [x, y] : [y, x];
  return { a, b, key: `${a}|${b}` };
}
