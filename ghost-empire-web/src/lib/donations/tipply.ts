// src/lib/donations/tipply.ts
// Tipply adapter (#donation-layer). Pure payload translation — no I/O, so it is unit-tested.
//
// Tipply is the dominant Polish tip service and has **no official API**: its panel exposes only
// Panel / Wiadomości / Wypłaty / Konfigurator / Cele / Widżety — no developer surface at all
// (verified in the live dashboard). What it does expose publicly is the data behind the streamer's
// OWN OBS widget:
//
//   GET https://tipply.pl/api/widget/last-tips/<userId>   (no auth)
//
// `<userId>` is the UUID at the end of the streamer's TIP_ALERT widget link, which they copy from
// their own Tipply configurator — so this is self-serve per tenant with no OAuth app and no partner
// approval.
//
// TRUST — deliberately `unverified`, and it must stay that way:
//   * the endpoint is undocumented (Tipply has already renamed one socket event from `tip` to
//     `tip_consumed`), so its shape can change without notice;
//   * the UUID is a capability id, not a credential, and nothing about the response is signed;
//   * using it at all may sit uneasily with Tipply's terms.
// So Tipply donations are RECORDED and land in the streamer's reconciliation queue. We never mint
// real-money-backed currency from an unauthenticated, undocumented source.
//
// (Tipply also runs a Socket.IO alert stream — same UUID, push instead of poll. Polling fits the
// existing serverless cron with zero new infrastructure, so that is what this adapter feeds.)
import { clampText, syntheticExternalId, type NormalizedDonation } from "./types";
import { MAX_AMOUNT_MINOR } from "./fx";
import { pollSince, selectFresh, pominietoMs, DEFAULT_MAX_LOOKBACK_MS } from "./cursor";

/** One item of Tipply's last-tips response. Everything optional — it is remote, undocumented input. */
export type TipplyTip = {
  id?: unknown;
  /** Amount in GROSZE (integer minor units) — Tipply is PLN-only. */
  amount?: unknown;
  commission?: unknown;
  nickname?: unknown;
  /** The paid message; Tipply's product IS "a paid message on stream", so this is normally present. */
  message?: unknown;
  createdAt?: unknown;
  created_at?: unknown;
};

/** Tipply's UUID as it appears at the end of a TIP_ALERT widget URL. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Extract the widget UUID from whatever the streamer pastes — the full widget URL or the bare id.
 * Returns null when it is not a UUID, so the panel can reject it instead of storing junk that would
 * silently poll nothing.
 */
export function parseTipplyWidgetId(input: string): string | null {
  const raw = String(input ?? "").trim();
  if (!raw) return null;
  const last = raw.split(/[/?#]/).filter(Boolean).pop() ?? "";
  return UUID_RE.test(last) ? last.toLowerCase() : null;
}

/**
 * Translate one Tipply tip into the normalized event, or null when it is unusable.
 *
 * Amounts arrive in grosze already, so they are NOT multiplied. `commission` is ignored: the goal is
 * what the supporter paid, not what the streamer nets — the same convention as every other rail.
 *
 * @remarks unit-tested in `__tests__/donations-tipply.test.ts`.
 */
export function parseTipplyTip(tip: TipplyTip): NormalizedDonation | null {
  if (!tip || typeof tip !== "object") return null;

  const rawAmount = typeof tip.amount === "number" ? tip.amount : Number(String(tip.amount ?? "").replace(",", "."));
  if (!Number.isFinite(rawAmount) || rawAmount <= 0) return null;
  const amountMinor = Math.round(rawAmount);
  if (amountMinor > MAX_AMOUNT_MINOR) return null; // guard the int4 column

  const donorName = clampText(tip.nickname, 200) ?? "Anon";
  const message = clampText(tip.message, 2000);

  const stamp = tip.createdAt ?? tip.created_at;
  const parsed = typeof stamp === "string" || typeof stamp === "number" ? new Date(stamp) : new Date(NaN);
  const hasStamp = !Number.isNaN(parsed.getTime());
  const donatedAt = hasStamp ? parsed : new Date();

  // Tipply's own id when present; otherwise a deterministic one so re-polling the same tip dedupes.
  //
  // That fallback hashes the timestamp, so a row with NEITHER an id NOR a usable timestamp would get
  // a different id on every poll — the same tip would land in the streamer's reconciliation queue
  // once per poll, and each copy could be approved separately. An undedupable row is therefore
  // DROPPED: losing one untrackable tip is strictly better than inviting a multi-credit.
  const ownId = clampText(tip.id, 180);
  if (!ownId && !hasStamp) return null;
  const providerEventId =
    ownId ?? syntheticExternalId("tipply", { donorName, amountMinor, currency: "PLN", donatedAt });

  return {
    provider: "tipply",
    providerEventId,
    donorName,
    message,
    amountMinor,
    currency: "PLN", // Tipply is PLN-only
    donatedAt,
    // NEVER "verified" — see the trust note in the file header. This is the whole safety story.
    trust: "unverified",
    raw: tip,
  };
}

/** Translate a whole last-tips response, dropping unusable rows. */
export function parseTipplyFeed(payload: unknown): NormalizedDonation[] {
  const items = Array.isArray(payload)
    ? payload
    : Array.isArray((payload as { data?: unknown })?.data)
      ? ((payload as { data: unknown[] }).data)
      : [];
  const out: NormalizedDonation[] = [];
  for (const item of items.slice(0, 100)) {
    const d = parseTipplyTip(item as TipplyTip);
    if (d) out.push(d);
  }
  return out;
}

/** The public endpoint for a streamer's recent tips. */
export function tipplyFeedUrl(widgetId: string, limit = 25): string {
  return `https://tipply.pl/api/widget/last-tips/${encodeURIComponent(widgetId)}?limit=${limit}`;
}

/**
 * How far back a Tipply poll may reach. Tipply's page is small (~25) and PL-only, so the shared
 * backstop fits; the constant is kept exported because the tests and docs name it.
 */
export const TIPPLY_MAX_LOOKBACK_MS = DEFAULT_MAX_LOOKBACK_MS;

/**
 * The oldest tip a poll for this integration may ingest.
 *
 * Thin wrapper over the shared {@link pollSince} — the "never replay the page as live donations"
 * rule is identical for every polling provider and lives in `cursor.ts`, so DonationAlerts and any
 * future poll adapter inherit the same behaviour instead of re-deriving it.
 *
 * @remarks unit-tested in `__tests__/donations-tipply.test.ts`.
 */
export function tipplySince(createdAt: Date, lastEventAt: Date | null, now: Date): Date {
  return pollSince(createdAt, lastEventAt, now, TIPPLY_MAX_LOOKBACK_MS);
}

/**
 * Ile wpłat mogło przepaść, bo kursor wypadł poza okno — patrz {@link pominietoMs}.
 *
 * @remarks
 * Tipply jest jedynym dostawcą z sufitem okna: DonationAlerts jedzie na `vendorSince` (bez sufitu),
 * a Streamlabs w ogóle nie ma kursora i dedupuje po `Donation.externalId`. Dlatego tylko tutaj
 * długa przerwa w pollowaniu potrafi trwale zgubić wpłatę i tylko tutaj trzeba o tym krzyczeć.
 */
export function tipplyPominietoMs(lastEventAt: Date | null, now: Date): number {
  return pominietoMs(lastEventAt, now, TIPPLY_MAX_LOOKBACK_MS);
}

/** Drop tips older than the cutoff — see {@link tipplySince}. */
export function selectFreshTips(tips: NormalizedDonation[], since: Date): NormalizedDonation[] {
  return selectFresh(tips, since);
}
