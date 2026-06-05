// Chat automod for the bot. Pulls the config from the portal (/api/bot/moderation)
// and evaluates each message with the same pure detectors as the web app
// (web: src/lib/moderation.ts — kept in sync). Returns the action to enforce
// (delete / timeout / warn) so each platform handler can act on it.
import { env } from "./env";

export type ModAction = "delete" | "timeout" | "warn";
export type ModViolation = "profanity" | "caps" | "length" | "repeat" | "zalgo";

const REFRESH_EVERY_MS = 2 * 60 * 1000;

// ---------- pure detectors (mirror of web src/lib/moderation.ts) ----------

export function capsRatio(text: string): number {
  const letters = [...text].filter((c) => /\p{L}/u.test(c));
  if (letters.length === 0) return 0;
  const upper = letters.filter((c) => c !== c.toLowerCase() && c === c.toUpperCase()).length;
  return upper / letters.length;
}
export function isExcessiveCaps(text: string, minLetters = 8, maxRatio = 0.7): boolean {
  const letters = [...text].filter((c) => /\p{L}/u.test(c));
  if (letters.length < minLetters) return false;
  return capsRatio(text) > maxRatio;
}
export function isTooLong(text: string, maxChars: number): boolean {
  return [...text].length > maxChars;
}
export function maxCharRun(text: string): number {
  let max = 0, run = 0;
  let prev: string | null = null;
  for (const c of [...text]) {
    if (c === prev) run += 1; else { run = 1; prev = c; }
    if (run > max) max = run;
  }
  return max;
}
export function maxWordRun(text: string): number {
  const words = text.toLowerCase().split(/\s+/).filter(Boolean);
  let max = 0, run = 0;
  let prev: string | null = null;
  for (const w of words) {
    if (w === prev) run += 1; else { run = 1; prev = w; }
    if (run > max) max = run;
  }
  return max;
}
export function isRepeatSpam(text: string, charRun = 8, wordRun = 4): boolean {
  return maxCharRun(text) >= charRun || maxWordRun(text) >= wordRun;
}
export function combiningRatio(text: string): number {
  const chars = [...text];
  if (chars.length === 0) return 0;
  return chars.filter((c) => /\p{M}/u.test(c)).length / chars.length;
}
export function maxCombiningRun(text: string): number {
  let max = 0, run = 0;
  for (const c of [...text]) {
    if (/\p{M}/u.test(c)) { run += 1; if (run > max) max = run; } else run = 0;
  }
  return max;
}
export function isZalgo(text: string, maxRatio = 0.2, maxRun = 3): boolean {
  return combiningRatio(text) > maxRatio || maxCombiningRun(text) > maxRun;
}
const LEET_MAP: Record<string, string> = {
  "@": "a", "4": "a", "3": "e", "1": "i", "!": "i", "|": "i",
  "0": "o", "$": "s", "5": "s", "7": "t",
};
export function normalizeForProfanity(text: string): string {
  let out = "";
  for (const ch of text.toLowerCase()) out += LEET_MAP[ch] ?? ch;
  return out.replace(/[^a-z0-9ąćęłńóśźż]/gu, "");
}
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

// ---------- config (synced from the portal) ----------

type Rule<T> = (T & { action: ModAction; timeoutSecs: number }) | null;
type ModConfig = {
  enabled: boolean;
  exempt: { subs: boolean; vips: boolean; mods: boolean };
  rules: {
    profanity: Rule<{ words: string[] }>;
    caps: Rule<{ minLetters: number; maxRatio: number }>;
    length: Rule<{ maxChars: number }>;
    repeat: Rule<{ charRun: number; wordRun: number }>;
    zalgo: Rule<{ maxRatio: number }>;
  };
};

let config: ModConfig = {
  enabled: false,
  exempt: { subs: true, vips: true, mods: true },
  rules: { profanity: null, caps: null, length: null, repeat: null, zalgo: null },
};

export async function refreshModeration(): Promise<void> {
  try {
    const res = await fetch(`${env.portalUrl}/api/bot/moderation`);
    if (!res.ok) { console.warn(`[moderation] fetch ${res.status} — keeping current`); return; }
    const data = (await res.json()) as Partial<ModConfig>;
    if (!data.enabled) {
      config = { enabled: false, exempt: { subs: true, vips: true, mods: true }, rules: { profanity: null, caps: null, length: null, repeat: null, zalgo: null } };
      return;
    }
    config = {
      enabled: true,
      exempt: data.exempt ?? { subs: true, vips: true, mods: true },
      rules: data.rules ?? { profanity: null, caps: null, length: null, repeat: null, zalgo: null },
    };
    const active = Object.entries(config.rules).filter(([, v]) => v).map(([k]) => k);
    console.log(`[moderation] enabled — rules: ${active.join(", ") || "(none)"}`);
  } catch (e) {
    console.warn("[moderation] fetch failed — keeping current:", (e as Error).message);
  }
}

export function startModerationSync(): void {
  void refreshModeration();
  setInterval(() => void refreshModeration(), REFRESH_EVERY_MS);
}

/** Evaluate a message; returns the action to enforce, or null if it's clean / exempt. */
export function checkMessage(
  message: string,
  ctx: { isSub: boolean; isVip: boolean; isMod: boolean },
): { action: ModAction; timeoutSecs: number; violation: ModViolation } | null {
  if (!config.enabled) return null;
  if (config.exempt.subs && ctx.isSub) return null;
  if (config.exempt.vips && ctx.isVip) return null;
  if (config.exempt.mods && ctx.isMod) return null;

  const r = config.rules;
  if (r.profanity && containsProfanity(message, r.profanity.words)) {
    return { action: r.profanity.action, timeoutSecs: r.profanity.timeoutSecs, violation: "profanity" };
  }
  if (r.zalgo && isZalgo(message, r.zalgo.maxRatio)) {
    return { action: r.zalgo.action, timeoutSecs: r.zalgo.timeoutSecs, violation: "zalgo" };
  }
  if (r.length && isTooLong(message, r.length.maxChars)) {
    return { action: r.length.action, timeoutSecs: r.length.timeoutSecs, violation: "length" };
  }
  if (r.caps && isExcessiveCaps(message, r.caps.minLetters, r.caps.maxRatio)) {
    return { action: r.caps.action, timeoutSecs: r.caps.timeoutSecs, violation: "caps" };
  }
  if (r.repeat && isRepeatSpam(message, r.repeat.charRun, r.repeat.wordRun)) {
    return { action: r.repeat.action, timeoutSecs: r.repeat.timeoutSecs, violation: "repeat" };
  }
  return null;
}

const VIOLATION_PL: Record<ModViolation, string> = {
  profanity: "wulgaryzmy",
  caps: "za dużo CAPS",
  length: "za długa wiadomość",
  repeat: "spam / powtórzenia",
  zalgo: "tekst zalgo",
};
export function violationLabel(v: ModViolation): string {
  return VIOLATION_PL[v];
}

// ---------- escalation + stats logging (mirror of web src/lib/moderation.ts) ----------

/** Escalate the action for a repeat offender: after a couple of strikes anything
 *  softer than a timeout becomes a timeout; a lone "warn" first hardens to "delete". */
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

export type Verdict = { action: ModAction; timeoutSecs: number; violation: ModViolation };

// Rolling per-user strike window. In-memory (resets on restart) — fine for a short
// escalation window. Keyed by `${platform}:${username}`.
const ESCALATION_WINDOW_MS = 30 * 60 * 1000;
const offenders = new Map<string, { count: number; first: number }>();

/** Bump the offender's strike count and return the escalated verdict + prior count. */
export function escalate(platform: string, username: string | undefined, verdict: Verdict): Verdict & { priorCount: number } {
  const key = `${platform}:${(username ?? "anon").toLowerCase()}`;
  const now = Date.now();
  const prev = offenders.get(key);
  const inWindow = prev !== undefined && now - prev.first < ESCALATION_WINDOW_MS;
  const prior = inWindow ? prev.count : 0;
  offenders.set(key, { count: prior + 1, first: inWindow ? prev.first : now });

  const action = escalateAction(verdict.action, prior);
  const timeoutSecs = action === "timeout" ? escalateTimeout(verdict.timeoutSecs, prior) : verdict.timeoutSecs;
  return { action, timeoutSecs, violation: verdict.violation, priorCount: prior };
}

/** Fire-and-forget log of an enforced violation to the portal for stats. */
export function logViolation(platform: string, username: string | undefined, violation: ModViolation, action: ModAction, priorCount: number): void {
  void fetch(`${env.portalUrl}/api/internal/mod-violation`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${env.botSecret}` },
    body: JSON.stringify({ platform, username, violation, action, priorCount }),
  }).catch(() => {});
}
