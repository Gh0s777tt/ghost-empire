// src/lib/donations/ingest.ts
// THE donation pipeline (#donation-layer). Every provider adapter normalizes its payload into a
// NormalizedDonation and calls ingestDonation() — nothing else touches the money path.
//
// WHY: this pipeline previously existed as four hand-copied variants (Streamlabs poll, PayMedia
// webhook, YouTube super chats, admin manual match) which had already drifted apart — that is how
// three of the four ended up minting GT uncapped, at three different PLN rates. New providers plug
// in here instead of forking a fifth copy.
//
// GUARANTEES (in this order — the order is the design):
//  1. IDEMPOTENT. The provider event id is namespaced and stored on Donation.externalId (@unique).
//     A retry loses with P2002 and is reported as a duplicate, never credited twice.
//  2. TRUST-GATED. Only `verified` events may mint currency. An `unverified` event is persisted
//     with userId=null so it lands in the EXISTING admin reconciliation queue, which mints on
//     approval — so an open socket or a generic webhook can never mint by itself.
//  3. MONEY FIRST, EFFECTS AFTER. The charge/credit runs in one transaction; alerts, goals,
//     subathon, achievements, season XP and the receipt run after it commits and are best-effort,
//     so a failing side-effect can never roll back — or block — a credited donation.
import { prisma } from "@/lib/prisma";
import { gtFromPln } from "@/lib/donation-rate";
import { plnFromMinor, currencyDecimals, MAX_AMOUNT_MINOR } from "./fx";
import { matchDonationToUser } from "@/lib/streamlabs";
import { dispatchAlertSafe } from "@/lib/alerts";
import { incrementGoals } from "@/lib/stream-goals";
import { extendSubathon } from "@/lib/subathon";
import { sendDonationReceipt } from "@/lib/email-receipts";
import { createLogger } from "@/lib/logger";
import { clampText, externalIdFor, type DonationTrust, type NormalizedDonation } from "./types";

const log = createLogger("donations.ingest");

/**
 * THE mint gate, as a pure function so the invariant the whole design rests on is testable.
 *
 * Currency may be minted only when BOTH hold:
 *  - the event's authenticity is established (`trust === "verified"`), and
 *  - we know a real FX rate for its currency (`plnAmount !== null`).
 *
 * Everything else is recorded and reviewed by a human. Keep this boring and total — a bug here mints
 * real-money-backed currency out of thin air.
 *
 * @remarks unit-tested in `__tests__/donations-ingest.test.ts`.
 */
export function mayMintDonation(trust: DonationTrust, plnAmount: number | null): boolean {
  return trust === "verified" && plnAmount !== null && plnAmount > 0;
}

export type IngestResult =
  | { status: "credited"; userId: string; tokensGranted: number; donationId: string }
  | { status: "queued"; reason: "unverified" | "unmatched"; donationId: string }
  | { status: "duplicate" }
  | { status: "rejected"; reason: string };

/**
 * Ingest one normalized donation for a tenant.
 *
 * @param event  the provider-agnostic donation.
 * @param tenantId  portal the donation belongs to (null = legacy/founder rows).
 * @returns what happened — callers should log it, not branch on it for money decisions.
 */
export async function ingestDonation(event: NormalizedDonation, tenantId: string | null): Promise<IngestResult> {
  // ---- validate (a bad amount must never reach the ledger) -------------------------------------
  // Integer + int4 ceiling: `Donation.amountGrosze` is a Postgres int4, so an oversized value would
  // throw inside the transaction, surface as a 500, and make providers like Ko-fi RETRY in a loop.
  // Reject it here as a clean 4xx instead.
  if (!Number.isInteger(event.amountMinor) || event.amountMinor <= 0 || event.amountMinor > MAX_AMOUNT_MINOR) {
    return { status: "rejected", reason: "amount" };
  }
  if (!event.providerEventId) return { status: "rejected", reason: "no_event_id" };

  const externalId = externalIdFor(event.provider, event.providerEventId);
  const donorName = clampText(event.donorName, 200) ?? "Anon";
  const message = clampText(event.message, 2000);
  const decimals = currencyDecimals(event.currency);
  const amountMajor = event.amountMinor / 10 ** decimals;
  // Real per-currency rate; null = currency we do not know. We must NOT invent a rate (the old flat
  // "×4 for everything" over-minted a ¥1000 tip ~160×), so an unknown currency loses the right to
  // mint and the donation goes to review instead.
  const plnAmount = plnFromMinor(event.amountMinor, event.currency);

  // ---- match the donor to one of OUR users -----------------------------------------------------
  // The GE-code inside the donor message is the ONLY verification we accept (donor name is
  // attacker-chosen, see #audit3). A provider may also hand us a user id it round-tripped for us.
  // A provider-supplied user id bypasses the GE-code match, so it MUST be validated against this
  // portal (otherwise a future adapter could credit another tenant's user). Unresolvable → fall back
  // to the code match rather than trusting the claim.
  const claimed = event.knownUserId
    ? await prisma.user.findFirst({
        where: { id: event.knownUserId, ...(tenantId ? { OR: [{ tenantId }, { tenantId: null }] } : {}) },
        select: { id: true },
      }).catch(() => null)
    : null;
  const matchedUserId = claimed?.id ?? (await matchDonationToUser(message, tenantId))?.userId ?? null;

  // Trust gate (pure, tested): unverified OR unknown-currency events are RECORDED, never minted.
  const mayMint = mayMintDonation(event.trust, plnAmount);
  const creditUserId = mayMint ? matchedUserId : null;
  const tokensGranted = creditUserId ? gtFromPln(plnAmount ?? 0) : 0;

  // ---- persist (+ credit, atomically) ----------------------------------------------------------
  let donationId: string;
  try {
    donationId = await prisma.$transaction(async (tx) => {
      const row = await tx.donation.create({
        data: {
          tenantId,
          externalId,
          source: event.provider,
          donorName,
          message,
          amountGrosze: event.amountMinor,
          currency: event.currency,
          donatedAt: event.donatedAt,
          userId: creditUserId,
          matchedAt: creditUserId ? new Date() : null,
          matchType: creditUserId ? (claimed ? "provider" : "code") : null,
          tokensGranted: creditUserId ? tokensGranted : 0,
        },
        select: { id: true },
      });

      if (creditUserId) {
        await tx.user.update({
          where: { id: creditUserId },
          data: {
            isDonator: true,
            totalDonated: { increment: Math.round((plnAmount ?? 0) * 100) },
            tokens: { increment: tokensGranted },
            totalEarned: { increment: tokensGranted },
          },
        });
        await tx.transaction.create({
          data: {
            userId: creditUserId,
            type: "earn",
            amount: tokensGranted,
            reason: `donation:${externalId}`.slice(0, 200),
            externalId,
            status: "completed",
            note: message?.slice(0, 500) ?? null,
          },
        });
      }
      return row.id;
    });
  } catch (e: unknown) {
    const code = typeof e === "object" && e !== null && "code" in e ? (e as { code: string }).code : "";
    // P2002 on the unique externalId = this exact provider event was already ingested.
    if (code === "P2002") return { status: "duplicate" };
    throw e;
  }

  // ---- side-effects (after commit, best-effort — never block or undo the money above) ----------
  await runEffects({ event, tenantId, donorName, message, amountMajor, plnAmount, creditUserId, tokensGranted });

  if (creditUserId) {
    log.info("donation credited", { provider: event.provider, tenantId, tokensGranted });
    return { status: "credited", userId: creditUserId, tokensGranted, donationId };
  }
  log.info("donation queued for review", { provider: event.provider, tenantId, trust: event.trust });
  return { status: "queued", reason: mayMint ? "unmatched" : "unverified", donationId };
}

/** Alerts, goals, subathon, achievements, season XP and the receipt. Each isolated: one failing
 *  effect must not cost the others (they are independent, and the donation is already committed). */
async function runEffects(a: {
  event: NormalizedDonation; tenantId: string | null; donorName: string; message: string | null;
  amountMajor: number; plnAmount: number | null; creditUserId: string | null; tokensGranted: number;
}): Promise<void> {
  const safe = async (what: string, fn: () => Promise<unknown>) => {
    try { await fn(); } catch (e) {
      log.warn("donation effect failed", { what, provider: a.event.provider, error: e instanceof Error ? e.message : String(e) });
    }
  };

  // The streamer wants EVERY donation on the overlay, credited or not.
  await safe("alert", async () => {
    const actor = a.creditUserId
      ? await prisma.user.findUnique({ where: { id: a.creditUserId }, select: { username: true, displayName: true, image: true } })
      : null;
    await dispatchAlertSafe({
      type: "donation",
      title: "❤️ Donacja!",
      message: a.message ? `wpłacił z wiadomością: ${a.message.slice(0, 80)}` : "wsparł streamera",
      icon: "❤️",
      actorName: actor?.displayName || actor?.username || a.donorName,
      actorImage: actor?.image ?? undefined,
      amount: Math.round(a.amountMajor * 100) / 100,
      amountLabel: a.event.currency,
    }, a.tenantId);
  });

  // Goals + subathon track real money regardless of whether a viewer was credited.
  // Goals/subathon only move when we could actually value the money in PLN.
  if (a.plnAmount !== null) {
    await safe("goals", () => incrementGoals("donations_pln", Math.floor(a.plnAmount!), a.tenantId));
    await safe("subathon", () => extendSubathon({ pln: Math.floor(a.plnAmount!) }, a.tenantId));
  }

  if (!a.creditUserId) return; // nothing viewer-scoped to do for an uncredited donation

  await safe("achievements", async () => {
    const { checkAndGrantAchievements } = await import("@/lib/achievements");
    await checkAndGrantAchievements({ userId: a.creditUserId!, triggerType: "donations_count" });
    await checkAndGrantAchievements({ userId: a.creditUserId!, triggerType: "donations_amount_pln" });
  });
  await safe("seasonXp", async () => {
    const { awardSeasonXp } = await import("@/lib/seasons");
    await awardSeasonXp(a.creditUserId!, "donation_per_pln", a.amountMajor);
  });
  await safe("receipt", () => sendDonationReceipt({
    userId: a.creditUserId!,
    tenantId: a.tenantId,
    amount: a.amountMajor,      // as charged — never the synthetic PLN conversion
    currency: a.event.currency,
    tokensGranted: a.tokensGranted,
  }));
}
