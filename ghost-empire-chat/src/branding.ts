// Per-portal currency naming for VIEWER-FACING chat output (white-label).
//
// WHY this exists: the bot writes text that every portal's viewers read in
// Twitch/Kick/YouTube chat. Hardcoding the founder tenant's currency there
// ("Ghost Tokens"/"GT") leaks the founder brand into every sub-portal's chat —
// the same white-label leak CLAUDE.md forbids in the web app's pages.
//
// WHY we fetch instead of adding TOKEN_NAME/TOKEN_SYMBOL to the tenant .env:
// the currency already lives in the portal's `Tenant` row (tokenName/tokenSymbol)
// and is editable in /admin. Duplicating it into the bot's env would be a second
// source of truth that silently drifts the moment a streamer renames their
// currency in the panel. Fetching keeps ONE source of truth and self-heals on the
// next refresh. `GET /api/companion/branding` already serves exactly this shape,
// resolves the tenant from the request Host (same as every other /api/bot/* call
// this process makes, so it can only ever return THIS portal's branding), is
// public/read-only and rate-limited — no new endpoint, no new secret, and a new
// sub-portal gets correct chat copy from PORTAL_URL alone.
//
// FALLBACK: when the portal is unreachable we must NOT fall back to the founder's
// "Ghost Tokens"/"GT" — that is the very leak we're fixing, and an outage is
// exactly when nobody is watching. We fall back to brand-free generic Polish
// wording instead. A portal outage already degrades the bot (commands, FAQ,
// welcome and awards all come from the same portal), so a few minutes of generic
// currency wording is strictly better than permanently duplicated config.
import { env } from "./env";

export type Branding = {
  /** Full currency name, e.g. "Neo Coins" — used when the currency is named, not counted. */
  tokenName: string;
  /** Short unit shown next to an amount, e.g. "NC" in "Pula: 100 NC". */
  tokenSymbol: string;
};

/** Brand-free wording used until (and if) the portal answers. Never founder-branded. */
const NEUTRAL: Branding = { tokenName: "tokeny", tokenSymbol: "pkt" };

const REFRESH_EVERY_MS = 30 * 60 * 1000; // branding changes ~never; don't poll hard
const FETCH_TIMEOUT_MS = 5000; // startup awaits this fetch — it must not hang the boot
const MAX_LEN = 40; // a currency name longer than this is junk, not branding

let current: Branding = NEUTRAL;

/** Active currency name ("Neo Coins"). Use when naming the currency, not counting it. */
export function tokenName(): string {
  return current.tokenName;
}

/** Active currency symbol ("NC"). Use only directly after an amount. */
export function tokenSymbol(): string {
  return current.tokenSymbol;
}

/**
 * Normalise one branding value coming off the wire.
 *
 * This string is interpolated straight into an IRC PRIVMSG line, so a CR/LF (or
 * other control char) in an admin-typed currency name would break the protocol
 * frame — strip them and collapse the remaining whitespace. Returns null for
 * anything unusable so the caller keeps the previous (or neutral) branding.
 */
function clean(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, " ") // C0/C1 controls incl. CR/LF
    .replace(/\s+/g, " ")
    .trim();
  if (!s || s.length > MAX_LEN) return null;
  return s;
}

/**
 * Fetch this portal's currency naming. Keeps the current values on any failure.
 *
 * @returns true when the branding was refreshed from the portal.
 */
export async function refreshBranding(): Promise<boolean> {
  try {
    const res = await fetch(`${env.portalUrl}/api/companion/branding`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) {
      console.warn(`[branding] fetch ${res.status} — keeping ${describe()}`);
      return false;
    }
    const d = (await res.json()) as { tokenName?: unknown; tokenSymbol?: unknown };
    const name = clean(d.tokenName);
    const symbol = clean(d.tokenSymbol);
    // Both or nothing: a half-applied rename ("Neo Coins" counted in "GT") reads
    // worse to a viewer than the previous consistent pair.
    if (!name || !symbol) {
      console.warn(`[branding] malformed payload — keeping ${describe()}`);
      return false;
    }
    const changed = name !== current.tokenName || symbol !== current.tokenSymbol;
    current = { tokenName: name, tokenSymbol: symbol };
    if (changed) console.log(`[branding] currency: ${name} (${symbol})`);
    return true;
  } catch (e) {
    console.warn(`[branding] fetch failed — keeping ${describe()}:`, (e as Error).message);
    return false;
  }
}

function describe(): string {
  return `${current.tokenName} (${current.tokenSymbol})`;
}

/**
 * Load the branding, then keep it fresh.
 *
 * Awaited at startup BEFORE any chat client connects, so the first viewer-facing
 * message already carries the tenant's own currency rather than the neutral
 * fallback. The fetch is timeout-bounded, so an unreachable portal delays boot by
 * at most {@link FETCH_TIMEOUT_MS} instead of hanging it.
 */
export async function startBrandingSync(): Promise<void> {
  const ok = await refreshBranding();
  if (!ok) {
    console.warn(
      `[branding] portal unreachable at startup — using brand-free fallback ${describe()}; retrying every ${REFRESH_EVERY_MS / 60000} min`,
    );
  }
  setInterval(() => void refreshBranding(), REFRESH_EVERY_MS);
}

/** Test/diagnostic seam — overrides the cached branding without a fetch. */
export function _setBranding(b: Branding | null): void {
  current = b ?? NEUTRAL;
}
