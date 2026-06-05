"use client";
// src/components/admin/sections/Widgets.tsx — lazily-loaded "all overlays in one
// place" hub. Lists every token-gated OBS overlay with its ready-to-paste Browser
// Source URL + copy button. The token is shared across all overlays.
import { useState, useEffect, useCallback } from "react";
import { LayoutGrid, Copy, Check, ExternalLink, Plus, Trash2, Pencil, X, Loader2, Wand2 } from "lucide-react";
import { SectionCard } from "../shared";
import { CustomWidgetCard, WIDGET_FONTS } from "@/components/CustomWidgetCard";

const POSITIONS: Array<[string, string]> = [
  ["top-left", "Góra-lewo"], ["top-center", "Góra-środek"], ["top-right", "Góra-prawo"],
  ["center", "Środek"],
  ["bottom-left", "Dół-lewo"], ["bottom-center", "Dół-środek"], ["bottom-right", "Dół-prawo"],
];

type CustomWidget = {
  id: string; name: string; text: string; accentColor: string; textColor: string;
  fontSizePx: number; fontFamily: string; position: string; showCard: boolean;
};

type Widget = { id: string; name: string; path: string; desc: string; size: string; query?: string };

const WIDGETS: Widget[] = [
  { id: "alerts",      name: "Stream Alerts",      path: "/overlay",             desc: "Alerty na żywo: suby, gifty, bity, donejty, zakupy, eventy, powitania.", size: "1920×1080" },
  { id: "chat",        name: "Chat na ekranie",    path: "/overlay/chat",        desc: "Wiadomości z czatu (Twitch / Kick / YouTube), kolor per platforma.",     size: "600×900" },
  { id: "goals",       name: "Stream Goals",       path: "/overlay/goals",       desc: "Paski celów (suby / donejty / followy) + Hype Train.",                  size: "500×400" },
  { id: "subathon",    name: "Subathon",           path: "/overlay/subathon",    desc: "Odliczanie przedłużane subami/giftami/donejtami (kolor + napis).",       size: "600×200" },
  { id: "codes",       name: "Drop kodów",         path: "/overlay/codes",       desc: "Rotacja kodów (np. klucze do gier) — jeden na ekranie naraz.",          size: "600×300" },
  { id: "predictions", name: "Predykcje / zakłady", path: "/overlay/predictions", desc: "Aktualny otwarty/zamknięty zakład: opcje, % puli, pula.",               size: "500×400" },
  { id: "polls",       name: "Ankiety",            path: "/overlay/polls",       desc: "Aktualna otwarta ankieta: opcje + wyniki na żywo.",                     size: "500×400" },
  { id: "last-sub",    name: "Ostatni sub",        path: "/overlay/last-event",  query: "kind=sub",      desc: "Najnowszy subskrybent (Twitch sub / gift). Mały badge.",        size: "340×90" },
  { id: "last-donator", name: "Ostatni donator",   path: "/overlay/last-event",  query: "kind=donation", desc: "Najnowszy donejt — nick + kwota. Mały badge.",                  size: "340×90" },
  { id: "last-follower", name: "Ostatni follower", path: "/overlay/last-event",  query: "kind=follow",   desc: "Najnowszy obserwujący. Wymaga re-auth Twitcha (scope followers) + subskrypcji.", size: "340×90" },
  { id: "viewers",     name: "Liczba widzów",      path: "/overlay/viewers",     desc: "Aktualna liczba widzów na Twitchu (gdy live). Wymaga połączonego Twitcha.", size: "200×70" },
  { id: "emoji-combo", name: "Emoji combo",        path: "/overlay/emoji-combo", desc: "Gdy widzowie spamują to samo emoji — wybucha ×N COMBO. Wymaga restartu bota.", size: "400×260" },
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
  function urlFor(w: Widget) { return token ? `${origin}${w.path}?${w.query ? w.query + "&" : ""}token=${token}` : null; }

  function copy(w: Widget) {
    const url = urlFor(w);
    if (!url) return;
    navigator.clipboard.writeText(url);
    setCopied(w.id);
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
          const url = urlFor(w);
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
                  onClick={() => copy(w)}
                  disabled={!url}
                  className="px-2.5 border border-zinc-700 text-zinc-300 hover:border-zinc-500 transition-all disabled:opacity-40"
                  title="Kopiuj URL do OBS"
                >
                  {copied === w.id ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
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

      <div className="mt-5 pt-4 border-t border-zinc-800">
        <CustomWidgetGenerator onToast={onToast} token={token} origin={origin} />
      </div>
    </SectionCard>
  );
}

function CustomWidgetGenerator({
  onToast, token, origin,
}: {
  onToast: (k: "ok" | "err", m: string) => void;
  token: string | null;
  origin: string;
}) {
  const [list, setList] = useState<CustomWidget[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  // Form
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [accentColor, setAccentColor] = useState("#E50914");
  const [textColor, setTextColor] = useState("#ffffff");
  const [fontSizePx, setFontSizePx] = useState(28);
  const [fontFamily, setFontFamily] = useState("Inter");
  const [position, setPosition] = useState("top-left");
  const [showCard, setShowCard] = useState(true);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/widgets");
      if (r.ok) { const d = await r.json(); setList(d.widgets ?? []); }
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  function resetForm() {
    setEditingId(null); setName(""); setText("");
    setAccentColor("#E50914"); setTextColor("#ffffff");
    setFontSizePx(28); setFontFamily("Inter"); setPosition("top-left"); setShowCard(true);
  }

  function startEdit(w: CustomWidget) {
    setEditingId(w.id); setName(w.name); setText(w.text);
    setAccentColor(w.accentColor); setTextColor(w.textColor);
    setFontSizePx(w.fontSizePx); setFontFamily(w.fontFamily); setPosition(w.position); setShowCard(w.showCard);
  }

  async function save() {
    if (!text.trim()) { onToast("err", "Tekst widgetu jest wymagany"); return; }
    setBusy(true);
    try {
      const res = await fetch("/api/admin/widgets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: editingId ? "update" : "create",
          id: editingId ?? undefined,
          name, text, accentColor, textColor, fontSizePx, fontFamily, position, showCard,
        }),
      });
      const d = await res.json();
      if (!res.ok) { onToast("err", d.error ?? "Błąd"); return; }
      onToast("ok", editingId ? "Widget zapisany" : "Widget utworzony");
      resetForm();
      await load();
    } finally { setBusy(false); }
  }

  async function remove(id: string) {
    if (!window.confirm("Usunąć ten widget?")) return;
    const res = await fetch("/api/admin/widgets", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", id }),
    });
    if (res.ok) { onToast("ok", "Usunięto"); if (editingId === id) resetForm(); await load(); }
    else onToast("err", "Błąd");
  }

  function widgetUrl(id: string) { return token ? `${origin}/overlay/widget?token=${token}&id=${id}` : null; }

  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <Wand2 className="w-4 h-4 text-zinc-400" />
        <span className="text-sm font-bold text-white">Generator własnych widgetów</span>
      </div>
      <p className="text-[11px] text-zinc-500 mb-3 leading-relaxed">
        Twórz własne nakładki tekstowe (np. social handle, „teraz gram w…", ogłoszenie). Wspiera emoji i Unicode.
        Każdy widget ma własny URL do OBS — edycja aktualizuje się na overlayu na żywo (~8 s).
      </p>

      {/* Form + live preview */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-3">
        <div className="space-y-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nazwa (dla Ciebie)" maxLength={80}
            className="w-full bg-black border border-zinc-800 px-2 py-1.5 text-sm text-white outline-hidden focus:border-red-600" />
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} placeholder="Tekst na ekranie — emoji ✅ 🎮 ⭐ Unicode ✅" maxLength={500}
            className="w-full bg-black border border-zinc-800 px-2 py-1.5 text-sm text-white outline-hidden focus:border-red-600" />
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[11px] text-zinc-400">Kolor akcentu
              <input type="color" value={accentColor} onChange={(e) => setAccentColor(e.target.value)} className="w-full h-8 mt-0.5 bg-black border border-zinc-800 cursor-pointer" />
            </label>
            <label className="text-[11px] text-zinc-400">Kolor tekstu
              <input type="color" value={textColor} onChange={(e) => setTextColor(e.target.value)} className="w-full h-8 mt-0.5 bg-black border border-zinc-800 cursor-pointer" />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[11px] text-zinc-400">Rozmiar tekstu: {fontSizePx}px
              <input type="range" min={10} max={120} value={fontSizePx} onChange={(e) => setFontSizePx(parseInt(e.target.value, 10))} className="w-full" />
            </label>
            <label className="text-[11px] text-zinc-400">Czcionka
              <select value={fontFamily} onChange={(e) => setFontFamily(e.target.value)} className="w-full mt-0.5 bg-black border border-zinc-800 px-2 py-1.5 text-xs text-white outline-hidden focus:border-red-600">
                {WIDGET_FONTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2 items-end">
            <label className="text-[11px] text-zinc-400">Pozycja
              <select value={position} onChange={(e) => setPosition(e.target.value)} className="w-full mt-0.5 bg-black border border-zinc-800 px-2 py-1.5 text-xs text-white outline-hidden focus:border-red-600">
                {POSITIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
            <label className="flex items-center gap-2 text-[11px] text-zinc-300 cursor-pointer pb-1.5">
              <input type="checkbox" checked={showCard} onChange={(e) => setShowCard(e.target.checked)} className="accent-red-500" />
              Tło (karta)
            </label>
          </div>
          <div className="flex gap-2">
            <button onClick={save} disabled={busy || !text.trim()}
              className="flex-1 px-3 py-2 bg-red-700 hover:bg-red-600 text-white text-[10px] font-bold tracking-widest uppercase disabled:opacity-50 flex items-center justify-center gap-1.5">
              {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : editingId ? <Check className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
              {editingId ? "Zapisz zmiany" : "Utwórz widget"}
            </button>
            {editingId && (
              <button onClick={resetForm} className="px-3 py-2 border border-zinc-700 text-zinc-400 text-[10px] font-bold tracking-widest uppercase flex items-center gap-1">
                <X className="w-3 h-3" /> Anuluj
              </button>
            )}
          </div>
        </div>

        {/* Live preview */}
        <div>
          <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-1">Podgląd</label>
          <div className="border border-zinc-800 rounded-sm p-6 min-h-[120px] flex items-center justify-center"
            style={{ background: "repeating-conic-gradient(#18181b 0% 25%, #0a0a0a 0% 50%) 50% / 24px 24px" }}>
            <CustomWidgetCard text={text || "Twój tekst…"} accentColor={accentColor} textColor={textColor} fontSizePx={fontSizePx} fontFamily={fontFamily} showCard={showCard} />
          </div>
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="text-xs text-zinc-500 flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin" /> Ładowanie…</div>
      ) : list.length === 0 ? (
        <p className="text-zinc-600 text-xs">Brak własnych widgetów — stwórz pierwszy powyżej.</p>
      ) : (
        <div className="space-y-2">
          {list.map((w) => {
            const url = widgetUrl(w.id);
            return (
              <div key={w.id} className="border border-zinc-800 bg-black/30 p-2.5">
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className="text-sm font-bold text-white truncate">{w.name || "Widget"}</span>
                  <div className="flex gap-1.5 shrink-0">
                    <button onClick={() => startEdit(w)} className="text-zinc-500 hover:text-white" title="Edytuj"><Pencil className="w-3.5 h-3.5" /></button>
                    <button onClick={() => remove(w.id)} className="text-zinc-500 hover:text-red-400" title="Usuń"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
                <div className="flex gap-1.5">
                  <input readOnly value={url ?? "—"} className="flex-1 bg-black border border-zinc-800 px-2 py-1.5 text-[11px] text-zinc-300 font-mono truncate" />
                  <button onClick={() => { if (url) { navigator.clipboard.writeText(url); setCopied(w.id); setTimeout(() => setCopied(null), 1500); onToast("ok", "URL skopiowany"); } }}
                    disabled={!url} className="px-2.5 border border-zinc-700 text-zinc-300 hover:border-zinc-500 disabled:opacity-40" title="Kopiuj URL do OBS">
                    {copied === w.id ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
