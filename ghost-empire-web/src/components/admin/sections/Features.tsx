"use client";
// src/components/admin/sections/Features.tsx
// Owner panel to enable/disable viewer FEATURES per portal (/admin#features). One switch per module;
// OFF hides it from the viewer nav AND makes its page return 404 (server-side, via requireFeature).
// Reads/writes GET+POST /api/admin/features; the catalog + gating logic live in @/lib/features
// (allow-by-default: we store only the DISABLED keys). Copy is inline PL/EN (like HubManager) so this
// section is self-contained without touching the 14 locale files — the nav LABEL is the only i18n key.
import { useEffect, useState } from "react";
import { useLocale } from "next-intl";
import { LayoutGrid, Loader2, ExternalLink } from "lucide-react";
import { apiGet, apiPost, ApiError } from "@/lib/api-client";
import { FEATURES, type FeatureCategory } from "@/lib/features";
import { SectionCard } from "../shared";

const CATEGORY_ORDER: FeatureCategory[] = ["economy", "games", "community", "activities", "support"];

const T = {
  pl: {
    title: "Funkcje portalu", loading: "Ładowanie…",
    intro: "Włącz lub wyłącz moduły widoczne dla widzów. Wyłączona funkcja znika z nawigacji, a jej strona zwraca 404. Domyślnie wszystko włączone.",
    on: "Wł.", off: "Wył.", saveErr: "Nie udało się zapisać zmiany",
    cat: { economy: "Ekonomia", games: "Gry", community: "Społeczność", activities: "Aktywności", support: "Wsparcie" } as Record<FeatureCategory, string>,
    feat: {
      shop: "Sklep", sounds: "Dźwięki (nagrody)", drops: "Dropy", support: "Strona wsparcia",
      casino: "Kasyno", wheel: "Koło Fortuny", companion: "Companion", games: "Biblioteka gier",
      clans: "Klany", clips: "Klipy", collectibles: "Kolekcje", market: "Marketplace", leagues: "Ligi",
      achievements: "Osiągnięcia", seasons: "Sezony", wrapped: "Podsumowanie roku",
      events: "Eventy", bounties: "Bounties", auctions: "Aukcje", predictions: "Predykcje",
      polls: "Ankiety", trivia: "Trivia", quests: "Questy", schedule: "Harmonogram",
    } as Record<string, string>,
  },
  en: {
    title: "Portal features", loading: "Loading…",
    intro: "Turn viewer-facing modules on or off. A disabled feature disappears from the nav and its page returns 404. Everything is on by default.",
    on: "On", off: "Off", saveErr: "Couldn't save the change",
    cat: { economy: "Economy", games: "Games", community: "Community", activities: "Activities", support: "Support" } as Record<FeatureCategory, string>,
    feat: {
      shop: "Shop", sounds: "Sound rewards", drops: "Drops", support: "Support page",
      casino: "Casino", wheel: "Wheel", companion: "Companion", games: "Game library",
      clans: "Clans", clips: "Clips", collectibles: "Collectibles", market: "Marketplace", leagues: "Leagues",
      achievements: "Achievements", seasons: "Seasons", wrapped: "Wrapped",
      events: "Events", bounties: "Bounties", auctions: "Auctions", predictions: "Predictions",
      polls: "Polls", trivia: "Trivia", quests: "Quests", schedule: "Schedule",
    } as Record<string, string>,
  },
} as const;

export function FeaturesManager({ onToast }: { onToast: (k: "ok" | "err", m: string) => void; onSuccess?: () => void; pending?: boolean }) {
  const locale = useLocale();
  const t = locale.startsWith("pl") ? T.pl : T.en;
  const [disabled, setDisabled] = useState<Set<string> | null>(null); // null = still loading
  const [busy, setBusy] = useState<string | null>(null); // key currently saving

  useEffect(() => {
    apiGet<{ disabled: string[] }>("/api/admin/features")
      .then((d) => setDisabled(new Set(d.disabled)))
      .catch(() => setDisabled(new Set())); // fail-open to "all enabled" view; toggling re-checks server
  }, []);

  async function toggle(key: string, enable: boolean) {
    if (busy || !disabled) return;
    setBusy(key);
    // Optimistic: reflect the switch immediately, roll back if the server rejects.
    const prev = disabled;
    const next = new Set(prev);
    if (enable) next.delete(key); else next.add(key);
    setDisabled(next);
    try {
      const d = await apiPost<{ disabled: string[] }>("/api/admin/features", { key, enabled: enable });
      setDisabled(new Set(d.disabled)); // trust the server's canonical set
    } catch (e) {
      setDisabled(prev); // revert
      onToast("err", e instanceof ApiError ? e.message : t.saveErr);
    } finally {
      setBusy(null);
    }
  }

  if (!disabled) {
    return <SectionCard title={t.title} icon={LayoutGrid}><div className="text-zinc-500 text-sm flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> {t.loading}</div></SectionCard>;
  }

  return (
    <SectionCard title={t.title} icon={LayoutGrid}>
      <p className="text-zinc-500 text-xs mb-4">{t.intro}</p>
      <div className="space-y-4">
        {CATEGORY_ORDER.map((cat) => {
          const items = FEATURES.filter((f) => f.category === cat);
          if (items.length === 0) return null;
          return (
            <div key={cat}>
              <h4 className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-1.5">{t.cat[cat]}</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {items.map((f) => {
                  const enabled = !disabled.has(f.key);
                  return (
                    <div key={f.key} className={`flex items-center gap-2 border px-2.5 py-2 ${enabled ? "border-zinc-800 bg-black/20" : "border-zinc-900 bg-black/40 opacity-70"}`}>
                      <button
                        role="switch"
                        aria-checked={enabled}
                        aria-label={t.feat[f.key] ?? f.key}
                        disabled={busy === f.key}
                        onClick={() => void toggle(f.key, !enabled)}
                        className={`relative w-9 h-5 shrink-0 rounded-full transition-colors disabled:opacity-50 ${enabled ? "bg-emerald-600" : "bg-zinc-700"}`}
                      >
                        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${enabled ? "left-4" : "left-0.5"}`} />
                      </button>
                      <span className="flex-1 min-w-0 text-sm text-white truncate">{t.feat[f.key] ?? f.key}</span>
                      <span className={`text-[10px] font-mono uppercase tracking-wider ${enabled ? "text-emerald-400" : "text-zinc-600"}`}>{enabled ? t.on : t.off}</span>
                      <a href={f.href} target="_blank" rel="noreferrer" className="text-zinc-600 hover:text-zinc-300 shrink-0" title={f.href}><ExternalLink className="w-3.5 h-3.5" /></a>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
}
