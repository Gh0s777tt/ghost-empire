"use client";
// src/app/overlay/live/LiveClient.tsx
// Klient stałego źródła OBS (update 2026-08): odpytuje `/api/overlay/live` i renderuje scenę
// oznaczoną jako AKTYWNA. Dzięki temu przełączenie sceny w panelu (albo przyciskiem na Stream Decku)
// zmienia obraz na streamie BEZ dotykania OBS-a.
//
// Dlaczego polling, a nie SSE: źródło przeglądarkowe w OBS bywa usypiane i wznawiane, a lekki
// `fetch` co kilka sekund wraca do życia sam — strumień SSE po uśpieniu trzeba by odtwarzać ręcznie.
// Koszt jest znikomy (jedno zapytanie zwracające sam układ), a niezawodność w tym zastosowaniu
// liczy się bardziej niż natychmiastowość: pół sekundy zwłoki przy zmianie sceny nikomu nie wadzi.
import { useEffect, useState } from "react";
import type { SceneElement } from "@/lib/overlay-scenes";
import { SceneClient } from "../scene/[id]/SceneClient";

const INTERWAL_MS = 3000;

type Stan = { sceneId: string | null; elements: SceneElement[]; gotowe: boolean };

export function LiveClient() {
  const [stan, setStan] = useState<Stan>({ sceneId: null, elements: [], gotowe: false });

  useEffect(() => {
    let zywy = true;
    const token = new URL(window.location.href).searchParams.get("token") ?? "";

    async function pobierz() {
      try {
        const r = await fetch(`/api/overlay/live?token=${encodeURIComponent(token)}`, { cache: "no-store" });
        if (!r.ok) return; // 401/5xx → zostaw ostatni znany obraz, nie migaj pustką na streamie
        const d = (await r.json()) as { scene: { id: string } | null; elements?: SceneElement[] };
        if (!zywy) return;
        setStan({ sceneId: d.scene?.id ?? null, elements: d.elements ?? [], gotowe: true });
      } catch {
        /* sieć mrugnęła — następne odpytanie naprawi; celowo BEZ czyszczenia obrazu */
      }
    }

    void pobierz();
    const id = setInterval(() => void pobierz(), INTERWAL_MS);
    return () => { zywy = false; clearInterval(id); };
  }, []);

  if (!stan.gotowe) return null; // pierwsze odpytanie w toku — nie mrugaj komunikatem

  // Klucz na id sceny wymusza pełny remount przy zmianie sceny: iframe'y poprzedniej są niszczone,
  // a nie recyklowane pod nowe `src` — inaczej widget potrafiłby pokazać przez moment dane z
  // poprzedniej sceny.
  return (
    <SceneClient
      key={stan.sceneId ?? "brak"}
      elements={stan.elements}
      found={stan.sceneId !== null}
      enabled
    />
  );
}
