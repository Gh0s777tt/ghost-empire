// src/i18n/request.ts
// Per-request i18n config consumed by next-intl on the server: resolves the active
// locale (from the [locale] route segment) and loads its message bundle.
import { getRequestConfig } from "next-intl/server";
import { hasLocale } from "next-intl";
import { routing } from "./routing";

type Messages = Record<string, unknown>;

// Deep-merge a locale's catalog over EN so any missing/untranslated key falls back
// to English (never renders a raw key path). This lets us ship languages
// INCREMENTALLY — a newly-added locale with no catalog yet (or a partial one)
// serves EN for whatever it is missing.
function deepMerge(base: Messages, over: Messages): Messages {
  const out: Messages = { ...base };
  for (const [k, v] of Object.entries(over)) {
    const b = out[k];
    out[k] =
      b && typeof b === "object" && !Array.isArray(b) && v && typeof v === "object" && !Array.isArray(v)
        ? deepMerge(b as Messages, v as Messages)
        : v;
  }
  return out;
}

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;

  const en = ((await import(`../messages/en.json`)).default ?? {}) as Messages;
  if (locale === "en") return { locale, messages: en };

  try {
    const localized = ((await import(`../messages/${locale}.json`)).default ?? {}) as Messages;
    return { locale, messages: deepMerge(en, localized) };
  } catch {
    // No catalog for this locale yet → serve EN (incremental rollout).
    return { locale, messages: en };
  }
});
