// src/i18n/routing.ts
// next-intl routing config. PL is the default and stays UN-prefixed ("/", "/shop")
// so existing Polish URLs + SEO don't change; English lives under "/en/*".
import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["pl", "en"],
  defaultLocale: "pl",
  localePrefix: "as-needed",
});

export type AppLocale = (typeof routing.locales)[number];
