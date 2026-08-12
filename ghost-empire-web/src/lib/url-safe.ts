// src/lib/url-safe.ts
// Sanitizes user-supplied media URLs (shop item images, custom alert sounds, tenant
// background/avatar images, …). Only absolute http(s) URLs pass; everything else
// (javascript:, data:, vbscript:, relative, garbage) becomes null. Empty input → null.
//
// #sec-css-injection (layout.tsx bg `url("${…}")`): the sanitized value is interpolated
// straight into a CSS `url("…")` declaration, so a raw `")` + `{…}` payload could close the
// url() and inject arbitrary style rules (a CSS-breakout / style-injection). Returning the
// RAW trimmed input made that possible. We now defend twice:
//   1. Reject any input carrying a CSS/HTML breakout metacharacter — `"`, `)`, `{`, `}`,
//      newline or `\`. These are exactly the characters needed to break out of a
//      double-quoted url() or open a new declaration. `\` is rejected on the RAW input
//      *before* parsing, because the WHATWG URL parser silently rewrites `\`→`/`
//      (`https://x.com\evil` → `https://x.comevil/`), which would hide a breakout from any
//      after-the-fact scan of the parsed href.
//   2. Return the parser's percent-encoded `u.href`, never the raw input, so nothing the
//      parser normalizes leaks through verbatim.
// An encoded href is equally valid for the <img src>/<audio src> callers
// (ShopItem/Collectible/Auction/alert sounds/avatars), so this is non-breaking for them —
// the only visible change is that a bare origin gains its canonical trailing slash
// (`http://x.com` → `http://x.com/`).

/** CSS/HTML `url("…")` / attribute breakout metacharacters — any presence ⇒ reject. */
const URL_BREAKOUT_CHARS = /["){}\n\\]/;

export function safeMediaUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const trimmed = String(url).trim();
  if (!trimmed) return null;
  // Breakout-char reject runs on the RAW trimmed input (see header: `\` must be caught
  // before the URL parser normalizes it away).
  if (URL_BREAKOUT_CHARS.test(trimmed)) return null;
  try {
    const u = new URL(trimmed);
    // Only absolute http(s). Return the ENCODED href (not the raw input); keep the 2000-char
    // cap so a megabyte of junk never reaches a style attribute.
    if (u.protocol === "http:" || u.protocol === "https:") return u.href.slice(0, 2000);
  } catch {
    /* not a valid absolute URL */
  }
  return null;
}
