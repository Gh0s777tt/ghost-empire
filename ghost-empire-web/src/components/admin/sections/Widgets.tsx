"use client";
// src/components/admin/sections/Widgets.tsx — lazily-loaded "all overlays in one
// place" hub. Lists every token-gated OBS overlay with its ready-to-paste Browser
// Source URL + copy button. The token is shared across all overlays.
import { useState, useEffect } from "react";
import { LayoutGrid, Copy, Check, ExternalLink } from "lucide-react";
import { SectionCard } from "../shared";

type Widget = { id: string; name: string; path: string; desc: string; size: string };

const WIDGETS: Widget[] = [
  { id: "alerts",      name: "Stream Alerts",      path: "/overlay",             desc: "Alerty na żywo: suby, gifty, bity, donejty, zakupy, eventy, powitania.", size: "1920×1080" },
  { id: "chat",        name: "Chat na ekranie",    path: "/overlay/chat",        desc: "Wiadomości z czatu (Twitch / Kick / YouTube), kolor per platforma.",     size: "600×900" },
  { id: "goals",       name: "Stream Goals",       path: "/overlay/goals",       desc: "Paski celów (suby / donejty / followy) + Hype Train.",                  size: "500×400" },
  { id: "subathon",    name: "Subathon",           path: "/overlay/subathon",    desc: "Odliczanie przedłużane subami/giftami/donejtami (kolor + napis).",       size: "600×200" },
  { id: "codes",       name: "Drop kodów",         path: "/overlay/codes",       desc: "Rotacja kodów (np. klucze do gier) — jeden na ekranie naraz.",          size: "600×300" },
  { id: "predictions", name: "Predykcje / zakłady", path: "/overlay/predictions", desc: "Aktualny otwarty/zamknięty zakład: opcje, % puli, pula.",               size: "500×400" },
  { id: "polls",       name: "Ankiety",            path: "/overlay/polls",       desc: "Aktualna otwarta ankieta: opcje + wyniki na żywo.",                     size: "500×400" },
];

export function WidgetsLibrary({
  onToast,
}: {
  onToast: (k: "ok" | "err", m: string) => void;
  onSuccess: () => void;
  pending: boolean;
}) {
  const [token, setToken] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/overlay-token")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled) setToken(d?.token ?? null); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  function urlFor(path: string) { return token ? `${origin}${path}?token=${token}` : null; }

  function copy(path: string) {
    const url = urlFor(path);
    if (!url) return;
    navigator.clipboard.writeText(url);
    setCopied(path);
    setTimeout(() => setCopied(null), 1500);
    onToast("ok", "URL skopiowany");
  }

  return (
    <SectionCard title="Biblioteka widgetów" icon={LayoutGrid}>
      <p className="text-zinc-500 text-xs mb-3 leading-relaxed">
        Wszystkie overlaye OBS w jednym miejscu. Wklej URL jako <strong className="text-zinc-300">Browser Source</strong> w OBS
        (transparent background = ON, refresh on activate = ON). <strong className="text-zinc-300">Token jest wspólny</strong> dla
        wszystkich — „Wygeneruj nowy" w <em>Stream Alerts</em> unieważnia stare URL-e.
      </p>

      {!token && <p className="text-[11px] text-zinc-600 mb-3">Ładowanie tokenu overlayu…</p>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {WIDGETS.map((w) => {
          const url = urlFor(w.path);
          return (
            <div key={w.id} className="border border-zinc-800 bg-black/30 p-3 flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-bold text-white">{w.name}</span>
                <span className="text-[9px] font-mono uppercase tracking-widest text-zinc-600 shrink-0">{w.size}</span>
              </div>
              <p className="text-[11px] text-zinc-500 leading-snug flex-1">{w.desc}</p>
              <div className="flex gap-1.5">
                <input
                  readOnly
                  value={url ?? "—"}
                  className="flex-1 bg-black border border-zinc-800 px-2 py-1.5 text-[11px] text-zinc-300 font-mono truncate"
                />
                <button
                  onClick={() => copy(w.path)}
                  disabled={!url}
                  className="px-2.5 border border-zinc-700 text-zinc-300 hover:border-zinc-500 transition-all disabled:opacity-40"
                  title="Kopiuj URL do OBS"
                >
                  {copied === w.path ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
                {url && (
                  <a
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="px-2.5 border border-zinc-700 text-zinc-300 hover:border-zinc-500 transition-all flex items-center"
                    title="Otwórz podgląd w nowej karcie"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
}
