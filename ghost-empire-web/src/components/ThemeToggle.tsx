"use client";
// src/components/ThemeToggle.tsx
// Theme picker (#521). The chosen theme lives in a cookie the locale layout reads
// server-side (right theme in the HTML on first paint — no flash). Clicking a theme
// flips the cookie AND <html data-theme> for instant feedback; the [data-theme="…"]
// blocks in globals.css do the rest. Themes only re-tint surfaces, never the brand.
import { useState, useEffect, useRef } from "react";
import { Palette, Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { THEMES, normalizeTheme, type Theme } from "@/lib/themes";

const SWATCH: Record<Theme, string> = { dark: "#0a0a0a", light: "#fafafa", midnight: "#0a1020", slate: "#1c1c22" };

export function ThemeToggle() {
  const t = useTranslations("nav");
  const [theme, setTheme] = useState<Theme>("dark");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setTheme(normalizeTheme(document.documentElement.dataset.theme));
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  function pick(next: Theme) {
    document.documentElement.dataset.theme = next;
    document.cookie = `theme=${next}; path=/; max-age=31536000; samesite=lax`;
    setTheme(next);
    setOpen(false);
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        title={t("themePick")}
        aria-label={t("themePick")}
        aria-haspopup="menu"
        aria-expanded={open}
        className="w-8 h-8 inline-flex items-center justify-center border border-zinc-800 text-zinc-500 hover:text-amber-300 hover:border-amber-500 transition-colors"
      >
        <Palette className="w-4 h-4" />
      </button>

      {open && (
        <div role="menu" className="absolute end-0 top-full mt-1 w-40 border border-zinc-800 bg-zinc-950 shadow-xl z-50 py-1">
          {THEMES.map((th) => (
            <button
              key={th}
              role="menuitemradio"
              aria-checked={theme === th}
              onClick={() => pick(th)}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-zinc-300 hover:text-white hover:bg-zinc-900 transition-colors"
            >
              <span className="w-3.5 h-3.5 rounded-full border border-zinc-700 shrink-0" style={{ background: SWATCH[th] }} />
              <span className="flex-1 text-left">{t(`themeName_${th}`)}</span>
              {theme === th && <Check className="w-3.5 h-3.5 text-emerald-400" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
