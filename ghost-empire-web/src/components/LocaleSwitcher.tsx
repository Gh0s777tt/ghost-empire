"use client";
// src/components/LocaleSwitcher.tsx
// Language picker (11 locales). A compact dropdown listing each language by its
// own native name (autonym) — clearer than flags for a language menu, and scales
// past the old 2-button segmented control. PL is unprefixed ("/"), every other
// locale lives under "/<locale>/…"; selecting one switches on the SAME path.
import { useLocale } from "next-intl";
import { useState, useRef, useEffect } from "react";
import { ChevronDown } from "lucide-react";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { cn } from "@/lib/utils";

// Native language names (autonyms) — what speakers call their own language.
const NATIVE_NAME: Record<string, string> = {
  pl: "Polski", en: "English", de: "Deutsch", es: "Español", it: "Italiano",
  fr: "Français", zh: "中文", ja: "日本語", ko: "한국어", ru: "Русский", uk: "Українська",
  ar: "العربية", pt: "Português", id: "Bahasa Indonesia",
};

// Short badge override where the ISO-639 language code reads as the wrong thing:
// Ukrainian's language code is "uk", which users mistake for "United Kingdom" —
// show "UA" (Ukraine) instead. The routing locale stays "uk" (Intl/CLDR/URL).
const SHORT_CODE: Record<string, string> = { uk: "UA" };
const shortCode = (c: string) => SHORT_CODE[c] ?? c;

export function LocaleSwitcher() {
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Język / Language"
        title={NATIVE_NAME[locale] ?? locale}
        className="flex items-center gap-1.5 border border-zinc-800 px-2 py-1.5 text-[10px] font-bold uppercase tracking-widest text-zinc-300 transition-colors hover:bg-white/5 hover:text-white"
      >
        {shortCode(locale)}
        <ChevronDown className={cn("h-3 w-3 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <ul
          role="listbox"
          aria-label="Język / Language"
          className="absolute end-0 z-50 mt-1 max-h-80 w-44 overflow-auto border border-zinc-800 bg-zinc-950 py-1 shadow-xl"
        >
          {routing.locales.map((code) => {
            const active = code === locale;
            return (
              <li key={code} role="option" aria-selected={active}>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    if (!active) router.replace(pathname, { locale: code });
                  }}
                  className={cn(
                    "flex w-full items-center gap-2.5 px-3 py-1.5 text-start text-xs transition-colors",
                    active ? "bg-zinc-800 text-white" : "text-zinc-400 hover:bg-white/5 hover:text-white",
                  )}
                >
                  <span className="w-6 shrink-0 text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                    {shortCode(code)}
                  </span>
                  <span className="truncate">{NATIVE_NAME[code] ?? code}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
