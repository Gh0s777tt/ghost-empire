"use client";
// src/components/LocaleSwitcher.tsx
// PL/EN toggle. Switches locale on the SAME path via next-intl's router (PL → "/",
// EN → "/en/…"), preserving the current page.
import { useLocale } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";

export function LocaleSwitcher() {
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const next = locale === "pl" ? "en" : "pl";

  return (
    <button
      type="button"
      onClick={() => router.replace(pathname, { locale: next })}
      aria-label={locale === "pl" ? "Zmień język na angielski" : "Switch language to Polish"}
      className="px-2 py-1.5 border border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-600 text-[10px] font-bold tracking-widest uppercase transition-colors"
    >
      {locale === "pl" ? "EN" : "PL"}
    </button>
  );
}
