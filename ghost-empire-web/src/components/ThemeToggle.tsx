"use client";
// src/components/ThemeToggle.tsx
// Light/dark theme switch. The theme lives in a cookie that the locale layout
// reads server-side (so the right theme is in the HTML on first paint). Clicking
// flips the cookie AND the <html data-theme> attribute for instant feedback —
// the [data-theme="light"] rules in globals.css do the rest. Dark is the default.
import { useState, useEffect } from "react";
import { Sun, Moon } from "lucide-react";
import { useTranslations } from "next-intl";

export function ThemeToggle() {
  const t = useTranslations("nav");
  const [light, setLight] = useState(false);

  useEffect(() => {
    setLight(document.documentElement.dataset.theme === "light");
  }, []);

  function toggle() {
    const next = light ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    document.cookie = `theme=${next}; path=/; max-age=31536000; samesite=lax`;
    setLight(!light);
  }

  return (
    <button
      onClick={toggle}
      title={t(light ? "themeDark" : "themeLight")}
      aria-label={t(light ? "themeDark" : "themeLight")}
      className="w-8 h-8 inline-flex items-center justify-center border border-zinc-800 text-zinc-500 hover:text-amber-300 hover:border-amber-500 transition-colors"
    >
      {light ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
    </button>
  );
}
