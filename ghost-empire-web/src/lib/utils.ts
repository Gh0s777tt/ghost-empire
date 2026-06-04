// src/lib/utils.ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function fmt(n: number): string {
  return n.toLocaleString("pl-PL");
}

export function timeLeft(iso: string | Date): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "Zakończony";
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (h > 48) return `${Math.floor(h / 24)}d`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function formatDate(date: string | Date): string {
  return new Date(date).toLocaleDateString("pl-PL", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function today(): string {
  return new Date().toISOString().split("T")[0];
}

export function timeAgo(iso: string | Date): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0) return "teraz";
  const sec = Math.floor(diff / 1000);
  if (sec < 30) return "teraz";
  if (sec < 60) return `${sec}s temu`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min temu`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} godz. temu`;
  const d = Math.floor(h / 24);
  if (d === 1) return "wczoraj";
  if (d < 7) return `${d} dni temu`;
  return new Date(iso).toLocaleDateString("pl-PL", { day: "2-digit", month: "short" });
}

export function xpForLevel(level: number): number {
  // Each level requires level * 500 XP
  return level * 500;
}

export function levelFromXp(xp: number): number {
  // Inverse: level = floor(xp / 500)
  return Math.max(1, Math.floor(xp / 500));
}

export function rankForLevel(level: number): {
  name: string;
  color: string;
  emoji: string;
} {
  if (level >= 100) return { name: "GH0ST GOD",     color: "#E50914", emoji: "👁️" };
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

// Verify bot secret from incoming requests
export function verifyBotSecret(authHeader: string | null): boolean {
  if (!authHeader) return false;
  const secret = authHeader.replace("Bearer ", "");
  return secret === process.env.BOT_SECRET;
}
