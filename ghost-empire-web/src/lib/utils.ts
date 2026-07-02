// src/lib/utils.ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function fmt(n: number, locale: string = "pl"): string {
  // next-intl locale codes are valid BCP-47 tags → pass straight to Intl.
  return n.toLocaleString(locale);
}

/** Clamp an unknown to an integer in [min, max]; non-numbers or non-finite → `fallback`.
 *  Only accepts real numbers (a JSON string like "5" → fallback), matching the admin
 *  JSON-body validators that previously copy-pasted this per route (cooldowns/intervals/
 *  sizes). Floors before clamping. */
export function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.floor(v))) : fallback;
}

// "Event ended" label per locale (the only word in timeLeft; the rest is numeric).
const ENDED_LABEL: Record<string, string> = {
  pl: "Zakończony", en: "Ended", de: "Beendet", es: "Finalizado", it: "Terminato",
  fr: "Terminé", zh: "已结束", ja: "終了", ko: "종료됨", ru: "Завершено", uk: "Завершено",
};

export function timeLeft(iso: string | Date, locale: string = "pl"): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return ENDED_LABEL[locale] ?? ENDED_LABEL.en;
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (h > 48) return `${Math.floor(h / 24)}d`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function formatDate(date: string | Date, locale: string = "pl"): string {
  return new Date(date).toLocaleDateString(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/** Localized season label ("Czerwiec 2026" / "June 2026" / "六月 2026") from the season
 *  number (months since the 2026 epoch, 1-based — see seasons.monthBounds). seasons.ts keeps a
 *  Polish label for storage; this localizes the *display* per locale. Month is capitalized so it
 *  reads as a title in every locale. Pure — unit-tested. */
export function formatSeasonLabel(seasonNumber: number, locale: string = "pl"): string {
  const month0 = (((seasonNumber - 1) % 12) + 12) % 12; // guard negative/odd inputs
  const year = 2026 + Math.floor((seasonNumber - 1) / 12);
  const s = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(year, month0, 1)),
  );
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function today(): string {
  return new Date().toISOString().split("T")[0];
}

export function timeAgo(iso: string | Date, locale: string = "pl"): string {
  // Localized relative time for every locale via Intl (no hardcoded language strings).
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0) return rtf.format(0, "second"); // future / clock skew → "now"
  const sec = Math.floor(diff / 1000);
  if (sec < 30) return rtf.format(0, "second"); // "now" / "teraz"
  if (sec < 60) return rtf.format(-sec, "second");
  const min = Math.floor(sec / 60);
  if (min < 60) return rtf.format(-min, "minute");
  const h = Math.floor(min / 60);
  if (h < 24) return rtf.format(-h, "hour");
  const d = Math.floor(h / 24);
  if (d < 7) return rtf.format(-d, "day"); // numeric:"auto" → "yesterday" / "2 days ago"
  return new Date(iso).toLocaleDateString(locale, { day: "2-digit", month: "short" });
}

export function xpForLevel(level: number): number {
  // Each level requires level * 500 XP
  return level * 500;
}

export function levelFromXp(xp: number): number {
  // Inverse: level = floor(xp / 500)
  return Math.max(1, Math.floor(xp / 500));
}

/**
 * Progress within the CURRENT level, consistent with `levelFromXp` (the authoritative
 * level-up curve — `lib/leveling.ts` uses it). #756: because `levelFromXp` floors with a
 * `Math.max(1, …)`, **level 1 spans xp [0, 1000)** (two 500-buckets) while every level ≥ 2
 * spans one 500-bucket. So a naive `xp % 500 / 500` bar is WRONG at level 1 — it fills, snaps
 * back to 0% at xp 500 with no level-up, then fills again. Use this for every XP bar/label so
 * the display matches the real boundaries.
 */
export function levelProgress(xp: number): { level: number; into: number; span: number; pct: number; nextLevelXp: number } {
  const level = levelFromXp(xp);
  const levelStartXp = level === 1 ? 0 : level * 500; // level 1 starts at 0; level N≥2 at N*500
  const nextLevelXp = (level + 1) * 500; // the next level (≥2) begins at (level+1)*500
  const span = nextLevelXp - levelStartXp; // 1000 at level 1, 500 thereafter
  const into = Math.max(0, xp - levelStartXp);
  const pct = span > 0 ? Math.max(0, Math.min(100, Math.round((into / span) * 100))) : 0;
  return { level, into, span, pct, nextLevelXp };
}

export function rankForLevel(level: number): {
  name: string;
  color: string;
  emoji: string;
} {
  if (level >= 100) return { name: "ETERNAL",       color: "#E50914", emoji: "👁️" };
  if (level >= 75)  return { name: "PHANTOM LORD",  color: "#8B0000", emoji: "💀" };
  if (level >= 50)  return { name: "WRAITH",        color: "#FF4500", emoji: "🔥" };
  if (level >= 30)  return { name: "HAUNT",         color: "#4B0082", emoji: "👻" };
  if (level >= 15)  return { name: "SPECTER",       color: "#696969", emoji: "🌫️" };
  if (level >= 5)   return { name: "SHADOW",        color: "#A9A9A9", emoji: "👤" };
  return            { name: "GHOSTLING",            color: "#808080", emoji: "🥚" };
}

/** Public-safe display name: a real handle (displayName without spaces), else the
 *  username. A displayName containing a space is a leaked full name (e.g. from a
 *  Google login) and is NEVER shown. */
export function displayNick(displayName?: string | null, username?: string | null): string {
  const d = displayName?.trim();
  if (d && !/\s/.test(d)) return d;
  return username ?? "Anonim";
}

/** Whether a connection username is safe to show publicly as a platform @handle.
 *  Rejects whitespace (a leaked full name) and dots (an email local-part fallback
 *  like "john.doe", stored when an OAuth provider returned no real handle — e.g.
 *  a Google login without the YouTube channel handle). Real handles on Twitch /
 *  Kick / Discord never contain dots, so this is safe. */
export function isPublicHandle(username?: string | null): username is string {
  const u = username?.trim();
  return !!u && !/[\s.]/.test(u);
}

export function pluralPL(
  n: number,
  one: string,
  few: string,
  many: string
): string {
  if (n === 1) return `${n} ${one}`;
  if (n >= 2 && n <= 4) return `${n} ${few}`;
  return `${n} ${many}`;
}

/** Constant-time string compare — avoids leaking the secret via early-exit timing
 *  (plain `===` short-circuits on the first differing byte). A length mismatch returns
 *  early; the secret's length is not itself sensitive. Dependency-free on purpose so this
 *  shared util never pulls `node:crypto` into a client bundle. */
function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Verify bot secret from incoming requests (Authorization: Bearer <secret>).
export function verifyBotSecret(authHeader: string | null): boolean {
  const expected = process.env.BOT_SECRET;
  // Never authenticate against an unset/empty secret (would let "Bearer " match "").
  if (!expected || !authHeader) return false;
  const secret = authHeader.replace("Bearer ", "");
  return timingSafeEqualStr(secret, expected);
}

// Verify the Vercel-cron bearer (Authorization: Bearer <CRON_SECRET>) in constant time —
// parity with verifyBotSecret (the cron routes previously used a timing-variable `!==`). #audit4
export function verifyCronSecret(authHeader: string | null): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected || !authHeader) return false;
  return timingSafeEqualStr(authHeader, `Bearer ${expected}`);
}

// Verify a bot request that targets a specific tenant (Batch B). Accepts EITHER the
// global BOT_SECRET (so the existing single shared bot keeps working, with no
// behaviour change) OR — when the tenant has set its own `botSecret` — that
// per-tenant secret. Intentionally permissive: the global secret is always accepted.
// Strict per-tenant-only enforcement is gated on every tenant running its own bot
// instance with its own secret, which has to be coordinated with the bot repo; until
// then this is latent infrastructure that never rejects a currently-valid request.
export function verifyBotSecretForTenant(
  authHeader: string | null,
  tenantBotSecret: string | null | undefined,
): boolean {
  if (verifyBotSecret(authHeader)) return true;
  if (!tenantBotSecret || !authHeader) return false;
  const secret = authHeader.replace("Bearer ", "");
  return timingSafeEqualStr(secret, tenantBotSecret);
}
