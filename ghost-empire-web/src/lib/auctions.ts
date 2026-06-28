// src/lib/auctions.ts
// Auction House (#762) — a real GT sink. The owner lists a perk/item; viewers bid GT.
// Bidding holds the GT (escrow); being outbid refunds it; the winner's hold is burned at
// settlement (that's the sink). This module is the PURE, testable core — validation +
// derivation only. The atomic money path lives in /api/auctions (FOR UPDATE, like gift/titles).

export type AuctionStatus = "open" | "closed" | "cancelled";

export const AUCTION_TITLE_MIN = 3;
export const AUCTION_TITLE_MAX = 80;
export const AUCTION_DESC_MAX = 300;
export const AUCTION_MIN_BID_FLOOR = 10; // smallest a starting bid may be
export const AUCTION_MAX_BID = 100_000_000; // sanity ceiling (also clamps balances)
export const AUCTION_MIN_DURATION_MS = 5 * 60_000; // 5 minutes
export const AUCTION_MAX_DURATION_MS = 30 * 24 * 60 * 60_000; // 30 days
export const AUCTION_BID_INCREMENT_PCT = 0.05; // a raise must beat current by >= 5%...
export const AUCTION_MIN_INCREMENT = 10; // ...but always at least +10 GT

type EndsAt = Date | string | number;
function endsAtMs(v: EndsAt): number {
  return v instanceof Date ? v.getTime() : new Date(v).getTime();
}

/** The smallest acceptable next bid given the starting floor + current high bid. */
export function nextMinBid(minBid: number, currentBid: number | null | undefined): number {
  if (currentBid == null) return minBid;
  const step = Math.max(AUCTION_MIN_INCREMENT, Math.ceil(currentBid * AUCTION_BID_INCREMENT_PCT));
  return currentBid + step;
}

/** Is the auction still accepting bids right now? (open status AND not past its end.) */
export function isAuctionLive(a: { status: string; endsAt: EndsAt }, now: number): boolean {
  return a.status === "open" && endsAtMs(a.endsAt) > now;
}

/** Display state — collapses a past-end "open" row to "ended" so the UI reads true
 *  even before lazy settlement flips the stored status. */
export function displayStatus(a: { status: string; endsAt: EndsAt }, now: number): "live" | "ended" | "cancelled" {
  if (a.status === "cancelled") return "cancelled";
  if (a.status === "closed" || endsAtMs(a.endsAt) <= now) return "ended";
  return "live";
}

export type AuctionInput = {
  title: string;
  description?: string | null;
  imageUrl?: string | null;
  minBid: number;
  durationMs: number;
};

export type AuctionInputError = "title" | "description" | "imageUrl" | "minBid" | "duration";

/** Validate an admin's create-auction payload. Pure — the route trims/clamps too. */
export function validateAuctionInput(i: AuctionInput): { ok: true } | { ok: false; error: AuctionInputError } {
  const title = (i.title ?? "").trim();
  if (title.length < AUCTION_TITLE_MIN || title.length > AUCTION_TITLE_MAX) return { ok: false, error: "title" };
  if ((i.description ?? "").length > AUCTION_DESC_MAX) return { ok: false, error: "description" };
  if (i.imageUrl != null && i.imageUrl !== "" && !/^https?:\/\//i.test(i.imageUrl)) return { ok: false, error: "imageUrl" };
  if (!Number.isInteger(i.minBid) || i.minBid < AUCTION_MIN_BID_FLOOR || i.minBid > AUCTION_MAX_BID) return { ok: false, error: "minBid" };
  if (!Number.isFinite(i.durationMs) || i.durationMs < AUCTION_MIN_DURATION_MS || i.durationMs > AUCTION_MAX_DURATION_MS) return { ok: false, error: "duration" };
  return { ok: true };
}

export type BidError = "amount" | "min" | "poor";

/** Pure pre-flight for a bid. The route STILL re-checks atomically under a row lock —
 *  this just gives fast, friendly client/server feedback and a single source of truth. */
export function bidError(amount: number, minNext: number, balance: number): BidError | null {
  if (!Number.isInteger(amount) || amount <= 0 || amount > AUCTION_MAX_BID) return "amount";
  if (amount < minNext) return "min";
  if (amount > balance) return "poor";
  return null;
}
