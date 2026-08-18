"use client";
// src/lib/use-overlay-accent.ts
// Kolor akcentu dla źródeł overlaya — PER PORTAL, nie zaszyty.
//
// PO CO istnieje: sześć klientów overlaya startowało z `useState("#E50914")` i czytało kolor
// WYŁĄCZNIE z parametru `?accent=` w adresie źródła. Streamer, który go nie dopisał ręcznie,
// nadawał na antenie czerwień ZAŁOŻYCIELA — na warstwie, którą widzi cała widownia, a nie
// w panelu, który widzi tylko on. Panel naprawiono w tej samej sesji; to jest ta sama klasa
// defektu o jedną warstwę dalej.
//
// Kolejność źródeł jest celowa:
//  1. `?accent=` z adresu — JAWNE nadpisanie per źródło (streamer może chcieć innego koloru na
//     jednym widgecie niż na portalu); zostaje najwyższym priorytetem, żeby nie zepsuć setupów,
//     które już z niego korzystają,
//  2. `brandColor` portalu z `/api/companion/branding` (Host-scoped, więc rozstrzyga się sam),
//  3. neutralna szarość — NIE czerwień założyciela. Gdy nie wiadomo, czyj to portal, lepiej
//     nadać kolor niczyj niż cudzy.
import { useEffect, useState } from "react";

/** Neutralny kolor startowy: widoczny przez jeden tik, zanim dojdzie branding portalu. */
export const AKCENT_NEUTRALNY = "#52525b";

const HEX6 = /^[0-9a-fA-F]{6}$/;

/**
 * Zwraca kolor akcentu dla źródła overlaya.
 *
 * @param zFeedu - kolor podany przez feed widgetu (np. `accentColor` subathonu). Ma pierwszeństwo
 *   nad brandingiem portalu, bo jest ustawiany świadomie w panelu dla tego konkretnego widgetu.
 * @returns hex `#rrggbb` — nigdy pusty, nigdy czerwień założyciela.
 */
export function useOverlayAccent(zFeedu?: string | null): string {
  const [akcent, setAkcent] = useState(AKCENT_NEUTRALNY);

  useEffect(() => {
    // 1) jawne nadpisanie z adresu źródła
    const z = new URL(window.location.href).searchParams.get("accent");
    if (z && HEX6.test(z)) { setAkcent(`#${z}`); return; }

    // 2) branding portalu — Host-scoped, więc nie trzeba przekazywać tenanta
    let porzucone = false;
    void (async () => {
      try {
        const res = await fetch("/api/companion/branding", { cache: "no-store" });
        if (!res.ok || porzucone) return;
        const d = (await res.json()) as { brandColor?: unknown };
        if (typeof d.brandColor === "string" && /^#[0-9a-fA-F]{6}$/.test(d.brandColor)) {
          setAkcent(d.brandColor);
        }
      } catch {
        /* zostaje neutralny — źródło na antenie nie może się wywalić przez kolor */
      }
    })();
    return () => { porzucone = true; };
  }, []);

  // Feed wygrywa, gdy poda coś sensownego (subathon ma własny `accentColor` w panelu).
  return typeof zFeedu === "string" && /^#[0-9a-fA-F]{6}$/.test(zFeedu) ? zFeedu : akcent;
}
