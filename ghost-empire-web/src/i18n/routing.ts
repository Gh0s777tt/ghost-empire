// src/i18n/routing.ts
// next-intl routing config. PL is the default and stays UN-prefixed ("/", "/shop")
// so existing Polish URLs + SEO don't change; every other locale lives under its
// own prefix ("/en/*", "/de/*", "/es/*", …).
import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["pl", "en", "de", "es", "it", "fr", "zh", "ja", "ko", "ru", "uk", "ar", "pt", "id"],
  defaultLocale: "pl",
  localePrefix: "as-needed",
});

export type AppLocale = (typeof routing.locales)[number];
