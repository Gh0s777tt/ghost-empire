"use client";
// src/components/admin/sections/Widgets.tsx — lazily-loaded "all overlays in one
// place" hub. Lists every token-gated OBS overlay with its ready-to-paste Browser
// Source URL + copy button. The token is shared across all overlays.
import { useState, useEffect, useCallback } from "react";
import { LayoutGrid, Copy, Check, ExternalLink, Plus, Trash2, Pencil, X, Loader2, Wand2 } from "lucide-react";
import { SectionCard } from "../shared";
import { CustomWidgetCard } from "@/components/CustomWidgetCard";
import { EmojiPicker } from "@/components/EmojiPicker";
import { WIDGET_FONTS } from "@/lib/widget-fonts";
import { AlertCard } from "@/components/AlertCard";
import { ChatMessageRow } from "@/components/ChatMessageRow";
import { SubathonCard } from "@/components/SubathonCard";
import { CodeCard } from "@/components/CodeCard";
import { GoalBar } from "@/components/GoalBar";
import { PredictionOverlayCard } from "@/components/PredictionOverlayCard";
import { PollOverlayCard } from "@/components/PollOverlayCard";
import { LastEventCard } from "@/components/LastEventCard";
import type { ReactNode } from "react";

// Sample in-panel preview per widget (so you SEE how it looks without live data).
function widgetPreview(id: string): ReactNode {
  switch (id) {
    case "alerts":
      return <AlertCard alert={{ title: "Nowy sub!", message: "zasubował kanał — dzięki!", icon: "💜", actorName: "Widz_123", amount: 5000, amountLabel: "GT" }} accent="#E50914" />;
    case "chat":
      return (
        <div className="flex flex-col gap-1.5 w-full" style={{ maxWidth: 360 }}>
          <ChatMessageRow msg={{ id: "1", platform: "twitch", username: "Widz_77", message: "hej! pozdrawiam 🔥" }} />
          <ChatMessageRow msg={{ id: "2", platform: "kick", username: "KickoViewer", message: "siema ekipa 👋" }} />
        </div>
      );
    case "goals":
      return <div style={{ width: 360 }}><GoalBar goal={{ id: "g", type: "subs", label: "Cel: suby", current: 34, target: 50, color: "#E50914", completedAt: null }} accent="#E50914" /></div>;
    case "subathon":
      return <SubathonCard remainingMs={2 * 3600 * 1000 + 34 * 60 * 1000} ended={false} accent="#E50914" label="Subathon" />;
    case "codes":
      return <CodeCard title="Darmowy kod!" label="Cyberpunk 2077 (Steam)" code="ABCD-EFGH-IJKL" accent="#16a34a" />;
    case "predictions":
      return <PredictionOverlayCard question="Ile zgonów w tym streamie?" options={[{ label: "Mniej niż 5", total: 1400, count: 3 }, { label: "5–10", total: 900, count: 2 }, { label: "Więcej niż 10", total: 450, count: 1 }]} totalPot={2750} accent="#a855f7" />;
    case "polls":
      return <PollOverlayCard question="W co gramy w piątek?" options={[{ label: "Opcja A", count: 42 }, { label: "Opcja B", count: 27 }, { label: "Opcja C", count: 15 }]} total={84} accent="#3b82f6" />;
    case "last-sub":
      return <LastEventCard label="Ostatni sub" name="Widz_123" icon="💜" accent="#a855f7" />;
    case "last-donator":
      return <LastEventCard label="Ostatni donator" name="Anonim" detail="20 PLN" icon="💰" accent="#22c55e" />;
    case "last-follower":
      return <LastEventCard label="Ostatni follower" name="NowyWidz" icon="⭐" accent="#3b82f6" />;
    case "viewers":
      return <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(15,15,20,0.92)", border: "2px solid #E50914", borderRadius: 999, padding: "7px 14px", color: "#fff", fontWeight: 800 }}>👁 1 234</div>;
    case "emoji-combo":
      return <div style={{ textAlign: "center", color: "#fff" }}><div style={{ fontSize: 64, lineHeight: 1 }}>🔥</div><div style={{ fontSize: 28, fontWeight: 900, textShadow: "0 0 12px #E50914" }}>×12 COMBO!</div></div>;
    default:
      return null;
  }
}

// Which admin section configures this widget's look (null = automatic, no config).
const CONFIG_SECTION: Record<string, string> = {
  alerts: "alerts", chat: "chat", goals: "goals", subathon: "subathon",
  codes: "drops", predictions: "predictions", polls: "polls",
};

const POSITIONS: Array<[string, string]> = [
  ["top-left", "Góra-lewo"], ["top-center", "Góra-środek"], ["top-right", "Góra-prawo"],
  ["center", "Środek"],
  ["bottom-left", "Dół-lewo"], ["bottom-center", "Dół-środek"], ["bottom-right", "Dół-prawo"],
];

type CustomWidget = {
  id: string; name: string; text: string; accentColor: string; textColor: string;
  fontSizePx: number; fontFamily: string; position: string; showCard: boolean;
  bgGradient: boolean; bgColor1: string; bgColor2: string; bgAngle: number;
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
  { id: "wheel",       name: "Koło Fortuny",       path: "/overlay/wheel",       desc: "Animacja zakręcenia koła + zwycięzca przy każdym spinie widza.",        size: "400×440" },
  { id: "rumble",      name: "Rumble status",      path: "/overlay/rumble",      desc: "LIVE + widzowie na Rumble, lub liczba obserwujących/subów. Wymaga RUMBLE_API_URL.", size: "360×120" },
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
  const [expanded, setExpanded] = useState<string | null>(null);

  // Jump to the section that configures a widget's look (uses the hashchange nav in AdminClient).
  function jump(section: string) {
    if (typeof window !== "undefined") window.location.hash = section;
  }

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

      <p className="text-[11px] text-zinc-600 mb-2">Kliknij widget, by zobaczyć <strong className="text-zinc-400">podgląd</strong>, skopiować URL i przejść do edycji wyglądu.</p>

      <div className="space-y-2">
        {WIDGETS.map((w) => {
          const url = urlFor(w);
          const isOpen = expanded === w.id;
          const cfg = CONFIG_SECTION[w.id];
          return (
            <div key={w.id} className="border border-zinc-800 bg-black/30">
              <button
                type="button"
                onClick={() => setExpanded(isOpen ? null : w.id)}
                className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-zinc-900/40 transition-colors"
                aria-expanded={isOpen}
              >
                <span className="flex items-center gap-2 min-w-0">
                  <span className="text-sm font-bold text-white truncate">{w.name}</span>
                  <span className="text-[9px] font-mono uppercase tracking-widest text-zinc-600 shrink-0">{w.size}</span>
                </span>
                <span className="text-zinc-500 shrink-0 text-xs">{isOpen ? "▾" : "▸"}</span>
              </button>
              {isOpen && (
                <div className="px-3 pb-3 space-y-2.5 border-t border-zinc-800/70 pt-2.5">
                  <p className="text-[11px] text-zinc-500 leading-snug">{w.desc}</p>
                  <div>
                    <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-1">Podgląd (tak wygląda na streamie)</div>
                    <div
                      className="border border-zinc-800 rounded-sm p-5 flex items-center justify-center overflow-hidden"
                      style={{ background: "repeating-conic-gradient(#18181b 0% 25%, #0a0a0a 0% 50%) 50% / 24px 24px", minHeight: 96 }}
                    >
                      {widgetPreview(w.id)}
                    </div>
                  </div>
                  <div className="flex gap-1.5">
                    <input readOnly value={url ?? "—"} className="flex-1 bg-black border border-zinc-800 px-2 py-1.5 text-[11px] text-zinc-300 font-mono truncate" />
                    <button onClick={() => copy(w)} disabled={!url} className="px-2.5 border border-zinc-700 text-zinc-300 hover:border-zinc-500 transition-all disabled:opacity-40" title="Kopiuj URL do OBS">
                      {copied === w.id ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                    {url && (
                      <a href={url} target="_blank" rel="noreferrer" className="px-2.5 border border-zinc-700 text-zinc-300 hover:border-zinc-500 transition-all flex items-center" title="Otwórz w nowej karcie">
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>
                  {cfg ? (
                    <button onClick={() => jump(cfg)} className="w-full text-[10px] font-mono uppercase tracking-widest text-zinc-300 hover:text-white border border-zinc-700 hover:border-red-600 px-2 py-1.5 flex items-center justify-center gap-1.5 transition-colors">
                      <Pencil className="w-3 h-3" /> Edytuj wygląd (kolory / czcionka / rozmiar) →
                    </button>
                  ) : (
                    <p className="text-[10px] text-zinc-600">Działa automatycznie — brak ustawień wyglądu.</p>
                  )}
                </div>
              )}
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
  const [bgGradient, setBgGradient] = useState(false);
  const [bgColor1, setBgColor1] = useState("#7928ca");
  const [bgColor2, setBgColor2] = useState("#ff0080");
  const [bgAngle, setBgAngle] = useState(135);

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
    setBgGradient(false); setBgColor1("#7928ca"); setBgColor2("#ff0080"); setBgAngle(135);
  }

  function startEdit(w: CustomWidget) {
    setEditingId(w.id); setName(w.name); setText(w.text);
    setAccentColor(w.accentColor); setTextColor(w.textColor);
    setFontSizePx(w.fontSizePx); setFontFamily(w.fontFamily); setPosition(w.position); setShowCard(w.showCard);
    setBgGradient(w.bgGradient); setBgColor1(w.bgColor1); setBgColor2(w.bgColor2); setBgAngle(w.bgAngle);
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
          bgGradient, bgColor1, bgColor2, bgAngle,
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
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] text-zinc-400">Tekst na ekranie (emoji / Unicode ✅)</span>
              <EmojiPicker onPick={(e) => setText((t) => (t.length < 500 ? t + e : t))} />
            </div>
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} placeholder="np. 🎮 Teraz gram w… · @TwójNick · 🔴 LIVE" maxLength={500}
              className="w-full bg-black border border-zinc-800 px-2 py-1.5 text-sm text-white outline-hidden focus:border-red-600" />
          </div>
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
                {WIDGET_FONTS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
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

          {showCard && (
            <div className="border border-zinc-800 bg-black/20 p-2 space-y-2">
              <label className="flex items-center gap-2 text-[11px] text-zinc-300 cursor-pointer">
                <input type="checkbox" checked={bgGradient} onChange={(e) => setBgGradient(e.target.checked)} className="accent-red-500" />
                Tło gradientowe 🌈
              </label>
              {bgGradient && (
                <div className="grid grid-cols-[auto_auto_1fr] gap-3 items-end">
                  <label className="text-[10px] text-zinc-400">Kolor 1
                    <input type="color" value={bgColor1} onChange={(e) => setBgColor1(e.target.value)} className="block w-12 h-7 mt-0.5 bg-black border border-zinc-800 cursor-pointer" />
                  </label>
                  <label className="text-[10px] text-zinc-400">Kolor 2
                    <input type="color" value={bgColor2} onChange={(e) => setBgColor2(e.target.value)} className="block w-12 h-7 mt-0.5 bg-black border border-zinc-800 cursor-pointer" />
                  </label>
                  <label className="text-[10px] text-zinc-400">Kąt: {bgAngle}°
                    <input type="range" min={0} max={360} value={bgAngle} onChange={(e) => setBgAngle(parseInt(e.target.value, 10))} className="w-full" />
                  </label>
                </div>
              )}
            </div>
          )}

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
            <CustomWidgetCard text={text || "Twój tekst…"} accentColor={accentColor} textColor={textColor} fontSizePx={fontSizePx} fontFamily={fontFamily} showCard={showCard} bgGradient={bgGradient} bgColor1={bgColor1} bgColor2={bgColor2} bgAngle={bgAngle} />
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
