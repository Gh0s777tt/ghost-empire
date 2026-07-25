// src/branding.ts
// Per-tenant currency naming for VIEWER-FACING chat output.
//
// WHY THIS EXISTS: the bot writes sentences that every portal's viewers read in
// Twitch/Kick/YouTube chat ("obstawiaj X", "Pula: 500 Y"), but the currency name is
// per-tenant (`Tenant.tokenName` / `Tenant.tokenSymbol` in the portal). Hardcoding the
// founder's "Ghost Tokens"/"GT" is a white-label leak (see CLAUDE.md), so the bot reads
// the real names from the portal it serves.
//
// WHY A FETCH AND NOT `TOKEN_NAME`/`TOKEN_SYMBOL` ENV VARS:
//  1. the value already lives in the portal's Tenant row — an env copy silently drifts:
//     a streamer renaming their currency in /admin would keep hearing the OLD name in
//     chat until somebody hand-edits an env file and restarts the process,
//  2. env.ts's req() throws on a missing var, so new *required* vars would break every
//     existing deployment; making them *optional* forces a founder-literal default
//     (`?? "GT"`) straight back into the bot,
//  3. one process per portal means every future `tenants/*.env` would carry the extra
//     lines forever.
// One process per portal also means `env.portalUrl` IS this tenant's Host, and
// GET /api/companion/branding is public, Host-resolved and rate-limited (120/min/IP) —
// so a TTL'd read is cheap AND lets a rename propagate without restarting the bot.
//
// INVARIANTS (viewer-facing output — keep these):
//  • never throws: a portal outage must not break the chat path (same best-effort
//    contract as portal.ts awardChat()),
//  • a failed or incomplete fetch degrades to BRAND-NEUTRAL wording, NEVER to "GT" —
//    generic is a cosmetic miss, a wrong currency name is the leak we're fixing,
//  • failures back off (RETRY_MS) so a down portal can't make every chat message pay a
//    network round-trip.
import { env } from "./env";

export type Branding = {
  /** Full currency name, used in prose: `obstawiaj <tokenName>`. */
  tokenName: string;
  /** Short unit, only ever printed directly after an amount: `500 <tokenSymbol>`. */
  tokenSymbol: string;
};

/**
 * Brand-neutral wording used until (or instead of) a successful fetch. Polish, matching
 * the bot's built-in copy. `tokenSymbol` is the genitive plural ("500 tokenów") because it
 * only ever follows a number, while `tokenName` is nominative ("obstawiaj tokeny").
 */
const NEUTRAL: Branding = { tokenName: "tokeny", tokenSymbol: "tokenów" };

const TTL_MS = 5 * 60_000; // re-read branding every 5 min → a rename lands without a restart
const RETRY_MS = 60_000; // after a failure, don't retry before this (protects the chat path)
const FETCH_TIMEOUT_MS = 4_000; // branding is decoration — never let it stall a reply for long

let cached: Branding = NEUTRAL;
/** Epoch ms before which getBranding() must not hit the network (TTL or failure back-off). */
let nextAttemptAt = 0;
/** Shared by concurrent callers so a burst of chat messages triggers ONE request. */
let inFlight: Promise<void> | null = null;

/** Accept a non-empty string and bound it — chat platforms cap message length (Twitch: 500). */
function cleanName(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim().slice(0, 32);
  return s.length ? s : null;
}

/** Best-effort refresh. Never throws; on any failure the previous value stays in place. */
async function fetchBranding(): Promise<void> {
  try {
    const res = await fetch(`${env.portalUrl}/api/companion/branding`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) {
      console.warn(`[branding] fetch ${res.status} — keeping "${cached.tokenName}"`);
      nextAttemptAt = Date.now() + RETRY_MS;
      return;
    }
    const d = (await res.json()) as { tokenName?: unknown; tokenSymbol?: unknown };
    const tokenName = cleanName(d.tokenName);
    const tokenSymbol = cleanName(d.tokenSymbol);
    if (!tokenName || !tokenSymbol) {
      // A half-filled payload would print "obstawiaj undefined" into chat — refuse it.
      console.warn(`[branding] incomplete payload — keeping "${cached.tokenName}"`);
      nextAttemptAt = Date.now() + RETRY_MS;
      return;
    }
    const changed = tokenName !== cached.tokenName || tokenSymbol !== cached.tokenSymbol;
    cached = { tokenName, tokenSymbol };
    nextAttemptAt = Date.now() + TTL_MS;
    if (changed) console.log(`[branding] currency: ${tokenName} (${tokenSymbol})`);
  } catch (e) {
    console.warn("[branding] fetch failed:", (e as Error).message);
    nextAttemptAt = Date.now() + RETRY_MS;
  }
}

/**
 * This portal's currency naming, refreshing when the TTL (or the failure back-off) expired.
 *
 * @returns the tenant's names, or the brand-neutral fallback while the portal is unreachable.
 * @remarks Never throws and never blocks longer than FETCH_TIMEOUT_MS. Concurrent callers
 * share one in-flight request, so a chat burst costs at most one round-trip.
 */
export async function getBranding(): Promise<Branding> {
  if (Date.now() >= nextAttemptAt) {
    inFlight ??= fetchBranding().finally(() => {
      inFlight = null;
    });
    await inFlight;
  }
  return cached;
}

/** Cached branding without ever awaiting a fetch — for synchronous call sites (commands.ts). */
export function brandingNow(): Branding {
  return cached;
}

/**
 * Substitute the portal's currency placeholders in a template using the CACHED branding
 * (no fetch, safe in sync code).
 *
 * @remarks Uses the same placeholder names as the portal's i18n catalogs
 * (`%tokenName%` for the full name, `%gt%` for the symbol) so bot copy and web copy
 * stay one convention.
 */
export function applyBranding(text: string): string {
  const b = cached;
  return text.replace(/%tokenName%/g, b.tokenName).replace(/%gt%/g, b.tokenSymbol);
}

/**
 * Warm the branding cache at startup and keep it warm, so the first viewer to type a
 * command already sees this portal's currency name. Best-effort — fetchBranding() swallows
 * its own errors, so a portal that is down at boot just leaves the neutral wording in place.
 */
export function startBrandingSync(): void {
  void fetchBranding();
  setInterval(() => void fetchBranding(), TTL_MS);
  console.log("[branding] sync every 5 min ←", `${env.portalUrl}/api/companion/branding`);
}
