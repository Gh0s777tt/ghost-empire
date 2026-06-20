// src/lib/chat-translate.ts
// PURE helpers for AI chat translation (#547). No server-only imports — the chat
// overlay (client) uses `shouldTranslate` without bundling the AI layer. The actual
// AI call + caching live in /api/chat/translate (server).

const LANG_NAMES: Record<string, string> = {
  en: "English", pl: "Polish", de: "German", es: "Spanish", fr: "French", it: "Italian",
  pt: "Portuguese", ru: "Russian", uk: "Ukrainian", nl: "Dutch", tr: "Turkish", cs: "Czech",
  ja: "Japanese", ko: "Korean", zh: "Chinese", ar: "Arabic", id: "Indonesian", sv: "Swedish",
};

/** ISO code → English language name for the prompt (unknown → the upper-cased code). */
export function langName(code: string): string {
  const c = (code || "").toLowerCase().slice(0, 2);
  return LANG_NAMES[c] || c.toUpperCase();
}

/**
 * Worth sending to the translator? Skip what would waste an AI call: empties, very
 * short messages, bot commands, bare links, and letter-less text (emote/emoji/number
 * only). Pure + cheap so the overlay can gate every message before any network call.
 */
export function shouldTranslate(text: string | null | undefined): boolean {
  const t = (text ?? "").trim();
  if (t.length < 3) return false;
  if (t.startsWith("!")) return false; // bot command
  if (/^https?:\/\/\S+$/i.test(t)) return false; // bare link
  if (!/\p{L}/u.test(t)) return false; // no letters → emote / emoji / numbers
  return true;
}

/** The instruction sent to the model. Asks for the translation only, idempotent if already target. */
export function buildTranslatePrompt(text: string, targetLangName: string): string {
  return `Translate this live-stream chat message to ${targetLangName}. Reply with ONLY the translation — no quotes, no notes, no romanization. If it is already in ${targetLangName}, reply with it unchanged.\n\nMessage: ${text}`;
}
