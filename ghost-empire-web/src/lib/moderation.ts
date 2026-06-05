// src/lib/moderation.ts
// Pure, dependency-free chat-moderation detectors. NO DB, NO side effects — the
// admin panel stores thresholds (future `ModRule` model) and the bot applies the
// action (delete / timeout / warn). Keeping detection pure makes the whole system
// unit-testable and identical across Twitch / Kick / YouTube.

export type ModViolation = "profanity" | "link" | "caps" | "length" | "repeat" | "zalgo";

export type ModAction = "delete" | "timeout" | "warn";

// ---------- CAPS (excessive uppercase) ----------

/** Fraction of *letters* that are uppercase (non-letters/emoji ignored). 0..1. */
export function capsRatio(text: string): number {
  const letters = [...text].filter((c) => /\p{L}/u.test(c));
  if (letters.length === 0) return 0;
  const upper = letters.filter((c) => c !== c.toLowerCase() && c === c.toUpperCase()).length;
  return upper / letters.length;
}

/** True when a message is mostly SHOUTING. `minLetters` avoids flagging short
 *  words like "OK"; `maxRatio` is the allowed uppercase fraction (exclusive). */
export function isExcessiveCaps(text: string, minLetters = 8, maxRatio = 0.7): boolean {
  const letters = [...text].filter((c) => /\p{L}/u.test(c));
  if (letters.length < minLetters) return false;
  return capsRatio(text) > maxRatio;
}

// ---------- LENGTH ----------

/** True when the message exceeds `maxChars` (counts Unicode code points). */
export function isTooLong(text: string, maxChars: number): boolean {
  return [...text].length > maxChars;
}

// ---------- REPEAT / FLOOD ----------

/** Longest run of the same character (code-point aware). "aaaa" → 4. */
export function maxCharRun(text: string): number {
  let max = 0;
  let run = 0;
  let prev: string | null = null;
  for (const c of [...text]) {
    if (c === prev) run += 1;
    else { run = 1; prev = c; }
    if (run > max) max = run;
  }
  return max;
}

/** Longest run of the same whitespace-separated token (case-insensitive). */
export function maxWordRun(text: string): number {
  const words = text.toLowerCase().split(/\s+/).filter(Boolean);
  let max = 0;
  let run = 0;
  let prev: string | null = null;
  for (const w of words) {
    if (w === prev) run += 1;
    else { run = 1; prev = w; }
    if (run > max) max = run;
  }
  return max;
}

/** True when the message is repeat-spam: a char repeated `charRun`+ times, or the
 *  same word repeated `wordRun`+ times (flood / copypasta / emote spam). */
export function isRepeatSpam(text: string, charRun = 8, wordRun = 4): boolean {
  return maxCharRun(text) >= charRun || maxWordRun(text) >= wordRun;
}

// ---------- ZALGO (stacked combining marks) ----------

/** Fraction of code points that are Unicode combining marks (Mn/Mc/Me). 0..1. */
export function combiningRatio(text: string): number {
  const chars = [...text];
  if (chars.length === 0) return 0;
  const combining = chars.filter((c) => /\p{M}/u.test(c)).length;
  return combining / chars.length;
}

/** Longest consecutive run of combining marks (zalgo stacks many on one base). */
export function maxCombiningRun(text: string): number {
  let max = 0;
  let run = 0;
  for (const c of [...text]) {
    if (/\p{M}/u.test(c)) { run += 1; if (run > max) max = run; }
    else run = 0;
  }
  return max;
}

/** True for "zalgo" / glitch text — too many combining marks overall, or a single
 *  base character with an absurd stack of them. */
export function isZalgo(text: string, maxRatio = 0.2, maxRun = 3): boolean {
  return combiningRatio(text) > maxRatio || maxCombiningRun(text) > maxRun;
}

// ---------- PROFANITY ----------

const LEET_MAP: Record<string, string> = {
  "@": "a", "4": "a", "3": "e", "1": "i", "!": "i", "|": "i",
  "0": "o", "$": "s", "5": "s", "7": "t",
};

/** Normalize a message for profanity matching: lowercase, fold common leetspeak,
 *  and strip separators people insert to dodge filters ("b a d", "b.a.d", "b-a-d").
 *  Keeps Polish letters. */
export function normalizeForProfanity(text: string): string {
  const lowered = text.toLowerCase();
  let out = "";
  for (const ch of lowered) out += LEET_MAP[ch] ?? ch;
  // Keep letters (incl. Polish) and digits; drop everything else (spaces, punctuation, emoji).
  return out.replace(/[^a-z0-9ąćęłńóśźż]/gu, "");
}

/** True when the (admin-supplied) wordlist matches the normalized message. Matching
 *  is substring on the separator-stripped form, which defeats spacing/punctuation
 *  evasion. An empty wordlist never matches. */
export function containsProfanity(text: string, words: string[]): boolean {
  if (!words || words.length === 0) return false;
  const haystack = normalizeForProfanity(text);
  if (!haystack) return false;
  for (const w of words) {
    const needle = normalizeForProfanity(w);
    if (needle && haystack.includes(needle)) return true;
  }
  return false;
}

// ---------- LINKS / URLS ----------

// Matches http(s) URLs and bare domains (example.com, bit.ly/x). TLD must be ≥2
// letters so "e.g" / "3.5" don't false-positive.
const LINK_RE = /(?:https?:\/\/)?(?:www\.)?(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}(?:\/\S*)?/gi;

/** All link-like tokens in the message. */
export function extractLinks(text: string): string[] {
  return text.match(LINK_RE) ?? [];
}

export function containsLink(text: string): boolean {
  return extractLinks(text).length > 0;
}

/** True when the message contains a link whose domain isn't in the whitelist. */
export function hasDisallowedLink(text: string, whitelist: string[]): boolean {
  const links = extractLinks(text);
  if (links.length === 0) return false;
  const wl = (whitelist ?? []).map((w) => w.toLowerCase().trim()).filter(Boolean);
  return links.some((link) => {
    const host = link.replace(/^https?:\/\//i, "").replace(/^www\./i, "").split("/")[0].toLowerCase();
    return !wl.some((w) => host.includes(w));
  });
}

// ---------- REGEX RULES ----------

/** True when any admin-supplied regex matches. Invalid / oversized patterns are skipped. */
export function matchesAnyRegex(text: string, patterns: string[]): boolean {
  for (const p of patterns ?? []) {
    if (!p || p.length > 200) continue;
    try {
      if (new RegExp(p, "i").test(text)) return true;
    } catch {
      /* invalid regex — ignore */
    }
  }
  return false;
}

// ---------- ORCHESTRATOR ----------

export type ModRuleConfig = {
  profanity?: { enabled: boolean; words: string[]; regex?: string[] };
  link?: { enabled: boolean; whitelist?: string[] };
  caps?: { enabled: boolean; minLetters?: number; maxRatio?: number };
  length?: { enabled: boolean; maxChars: number };
  repeat?: { enabled: boolean; charRun?: number; wordRun?: number };
  zalgo?: { enabled: boolean; maxRatio?: number; maxRun?: number };
};

/** Evaluate a message against the enabled rules; returns the FIRST violation found
 *  (priority: profanity → link → zalgo → length → caps → repeat) or null if clean. */
export function evaluateMessage(text: string, cfg: ModRuleConfig): ModViolation | null {
  if (cfg.profanity?.enabled && (containsProfanity(text, cfg.profanity.words) || matchesAnyRegex(text, cfg.profanity.regex ?? []))) return "profanity";
  if (cfg.link?.enabled && hasDisallowedLink(text, cfg.link.whitelist ?? [])) return "link";
  if (cfg.zalgo?.enabled && isZalgo(text, cfg.zalgo.maxRatio ?? 0.2, cfg.zalgo.maxRun ?? 3)) return "zalgo";
  if (cfg.length?.enabled && isTooLong(text, cfg.length.maxChars)) return "length";
  if (cfg.caps?.enabled && isExcessiveCaps(text, cfg.caps.minLetters ?? 8, cfg.caps.maxRatio ?? 0.7)) return "caps";
  if (cfg.repeat?.enabled && isRepeatSpam(text, cfg.repeat.charRun ?? 8, cfg.repeat.wordRun ?? 4)) return "repeat";
  return null;
}

// ---------- ESCALATION (repeat offenders) ----------
// Pure functions so the bot and web compute the same escalated punishment. Kept in
// sync with ghost-empire-chat/src/moderation.ts.

/** Escalate the action for a repeat offender: after a couple of strikes in the
 *  window, anything softer than a timeout becomes a timeout; a lone "warn" first
 *  hardens to "delete". `priorCount` = offenses already counted in the window. */
export function escalateAction(base: ModAction, priorCount: number): ModAction {
  if (priorCount >= 2 && base !== "timeout") return "timeout";
  if (priorCount >= 1 && base === "warn") return "delete";
  return base;
}

/** Escalate a timeout duration: doubles per prior offense, capped at 24h. */
export function escalateTimeout(baseSecs: number, priorCount: number): number {
  const scaled = baseSecs * Math.pow(2, Math.max(0, priorCount));
  return Math.min(Math.round(scaled), 86_400);
}
