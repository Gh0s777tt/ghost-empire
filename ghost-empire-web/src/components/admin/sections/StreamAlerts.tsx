"use client";
// src/components/admin/sections/StreamAlerts.tsx — lazily-loaded Stream Alerts (OBS overlay)
// manager: live preview, overlay token/URL, per-type config (AlertTypeList) and settings.
import { useState, useEffect } from "react";
import { Zap, Eye, EyeOff, Copy, Loader2, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { SectionCard } from "../shared";
import { AlertCard } from "@/components/AlertCard";
import {
  ALERT_TYPE_LIST,
  ALERT_ANIMATIONS,
  ALERT_POSITIONS,
  ANIMATION_LABELS,
  POSITION_LABELS,
  type AlertAnimation,
  type AlertPosition,
} from "@/lib/alert-types";
import type { StreamAlertsData } from "../types";

const ALERT_TYPE_LABEL: Record<string, string> = {
  shop_purchase:    "Zakup w sklepie",
  event_win:        "Wygrana w evencie",
  drop_claim_bonus: "Drop bonus claim",
  twitch_sub:       "Twitch — sub",
  twitch_gift_sub:  "Twitch — gifted sub",
  twitch_cheer:     "Twitch — cheer (bits)",
  donation:         "Donacja",
  welcome:          "Welcome / nowy user",
  level_up:         "Level up",
  test:             "Test (Admin)",
};

type AlertTypeRow = {
  type: string;
  label: string;
  animation: AlertAnimation;
  position: AlertPosition;
  soundUrl: string | null;
  minAmount: number | null;
  configured: boolean;
};

function AlertTypeList({
  enabledTypes,
  onToggle,
  onToast,
}: {
  enabledTypes: string[];
  onToggle: (t: string) => void;
  onToast: (k: "ok" | "err", m: string) => void;
}) {
  const [rows, setRows] = useState<AlertTypeRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [savingType, setSavingType] = useState<string | null>(null);
  const [openType, setOpenType] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/alert-types")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled) { if (d?.types) setRows(d.types); setLoaded(true); } })
      .catch(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, []);

  function patch(type: string, k: keyof AlertTypeRow, v: unknown) {
    setRows((rs) => rs.map((r) => (r.type === type ? { ...r, [k]: v } : r)));
  }

  async function save(row: AlertTypeRow) {
    setSavingType(row.type);
    try {
      const res = await fetch("/api/admin/alert-types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: row.type,
          animation: row.animation,
          position: row.position,
          soundUrl: row.soundUrl,
          minAmount: row.minAmount,
        }),
      });
      const d = await res.json();
      if (!res.ok) onToast("err", d.error ?? "Błąd");
      else { onToast("ok", `Zapisano: ${row.label}`); patch(row.type, "configured", true); }
    } catch {
      onToast("err", "Błąd sieci");
    } finally {
      setSavingType(null);
    }
  }

  return (
    <div className="mb-4">
      <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-2">
        Typy alertów — ● włącz/wyłącz · kliknij nazwę, by dostosować ({enabledTypes.length} aktywnych)
      </div>
      <div className="space-y-1.5">
        {ALERT_TYPE_LIST.map(({ type, label }) => {
          const active = enabledTypes.includes(type);
          const row = rows.find((r) => r.type === type);
          const open = openType === type;
          return (
            <div key={type} className={cn("border", active ? "border-red-900/60 bg-red-950/10" : "border-zinc-800 bg-black/30")}>
              <div className="flex items-center gap-2 px-2.5 py-1.5">
                <button
                  type="button"
                  onClick={() => onToggle(type)}
                  title={active ? "Wyłącz ten typ alertu" : "Włącz ten typ alertu"}
                  className={cn("text-base leading-none shrink-0", active ? "text-red-400" : "text-zinc-600 hover:text-zinc-400")}
                >
                  {active ? "●" : "○"}
                </button>
                <button
                  type="button"
                  onClick={() => setOpenType(open ? null : type)}
                  className="flex-1 flex items-center justify-between gap-2 text-left"
                >
                  <span className={cn("text-xs", active ? "text-zinc-200" : "text-zinc-500")}>{label}</span>
                  <span className="flex items-center gap-2 shrink-0">
                    {row?.configured && <span className="text-[9px] font-mono uppercase tracking-widest text-green-500">własne</span>}
                    <span className="text-zinc-500 text-[10px]">{open ? "▴" : "▾"}</span>
                  </span>
                </button>
              </div>
              {open && (
                <div className="border-t border-zinc-800/70 p-2.5">
                  {!row ? (
                    <p className="text-zinc-600 text-[10px]">Ładowanie ustawień…</p>
                  ) : (
                    <>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-1">Animacja</label>
                          <select value={row.animation} onChange={(e) => patch(type, "animation", e.target.value)} className="w-full bg-black border border-zinc-800 px-2 py-1.5 text-xs text-white outline-hidden focus:border-red-500">
                            {ALERT_ANIMATIONS.map((a) => <option key={a} value={a}>{ANIMATION_LABELS[a]}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-1">Pozycja</label>
                          <select value={row.position} onChange={(e) => patch(type, "position", e.target.value)} className="w-full bg-black border border-zinc-800 px-2 py-1.5 text-xs text-white outline-hidden focus:border-red-500">
                            {ALERT_POSITIONS.map((p) => <option key={p} value={p}>{POSITION_LABELS[p]}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-1">Dźwięk (URL, opcjonalnie)</label>
                          <input type="text" value={row.soundUrl ?? ""} onChange={(e) => patch(type, "soundUrl", e.target.value || null)} placeholder="https://…/sound.mp3" className="w-full bg-black border border-zinc-800 px-2 py-1.5 text-xs text-white outline-hidden focus:border-red-500" />
                        </div>
                        <div>
                          <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-1">Próg kwoty (≥, opcjonalnie)</label>
                          <input type="number" min={0} value={row.minAmount ?? ""} onChange={(e) => patch(type, "minAmount", e.target.value === "" ? null : Math.max(0, parseInt(e.target.value) || 0))} placeholder="np. 50" className="w-full bg-black border border-zinc-800 px-2 py-1.5 text-xs text-white outline-hidden focus:border-red-500" />
                        </div>
                      </div>
                      <button
                        onClick={() => save(row)}
                        disabled={savingType === type || !loaded}
                        className="mt-2 px-3 py-1.5 bg-green-700 hover:bg-green-600 text-white text-[10px] font-bold tracking-widest uppercase transition-all disabled:opacity-50 inline-flex items-center gap-1.5"
                      >
                        {savingType === type ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                        Zapisz ustawienia
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function StreamAlertsManager({
  data, onToast, onSuccess, pending,
}: {
  data: StreamAlertsData;
  onToast: (k: "ok" | "err", m: string) => void;
  onSuccess: () => void;
  pending: boolean;
}) {
  const [enabledTypes, setEnabledTypes] = useState<string[]>(data.settings.enabledTypes);
  const [durationMs, setDurationMs] = useState(data.settings.durationMs);
  const [accentColor, setAccentColor] = useState(data.settings.accentColor);
  const [soundEnabled, setSoundEnabled] = useState(data.settings.soundEnabled);
  const [sizeScale, setSizeScale] = useState(data.settings.sizeScale ?? 1);
  const [textScale, setTextScale] = useState(data.settings.textScale ?? 1);
  const [textColor, setTextColor] = useState(data.settings.textColor ?? "#d4d4d8");
  const [busy, setBusy] = useState(false);
  const [tokenVisible, setTokenVisible] = useState(false);
  const [tokenCopied, setTokenCopied] = useState(false);
  const [urlCopied, setUrlCopied] = useState(false);

  const previewAlerts = [
    { title: "Nowy sub!", message: "zasubował kanał — dzięki za wsparcie!", icon: "💜", actorName: "Widz_123", amount: 5000, amountLabel: "GT" },
    { title: "Donacja!", message: "postawił kawę 💸", icon: "💰", actorName: "Anonim", amount: 20, amountLabel: "PLN" },
  ];

  const dirty =
    JSON.stringify([...enabledTypes].sort()) !== JSON.stringify([...data.settings.enabledTypes].sort()) ||
    durationMs !== data.settings.durationMs ||
    accentColor !== data.settings.accentColor ||
    soundEnabled !== data.settings.soundEnabled ||
    sizeScale !== (data.settings.sizeScale ?? 1) ||
    textScale !== (data.settings.textScale ?? 1) ||
    textColor !== (data.settings.textColor ?? "#d4d4d8");

  function toggleType(t: string) {
    setEnabledTypes((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t],
    );
  }

  async function saveSettings() {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "settings",
          enabledTypes,
          durationMs,
          accentColor,
          soundEnabled,
          sizeScale,
          textScale,
          textColor,
        }),
      });
      const result = await res.json();
      if (!res.ok) {
        onToast("err", result.error ?? "Błąd");
      } else {
        onToast("ok", "Zapisano");
        onSuccess();
      }
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test" }),
      });
      const result = await res.json();
      if (!res.ok) onToast("err", result.error ?? "Błąd");
      else onToast("ok", "Wysłano test alert — sprawdź overlay");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SectionCard title="Stream Alerts (OBS Overlay)" icon={Zap}>
      <p className="text-zinc-500 text-xs mb-3">
        Alerty wyświetlane przez OBS Browser Source — pokazują live zakupy, wygrane, suby/bity, donacje.
        Overlay polluje serwer co ~1.2s — alert pojawi się max 1.5s po zdarzeniu.
      </p>

      {/* Live preview — odzwierciedla kolor akcentu wybrany niżej */}
      <div className="border border-zinc-800 bg-black/40 p-4 mb-3">
        <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-3">
          Podgląd na żywo — tak alert wygląda na overlayu OBS
        </div>
        <div className="mx-auto flex flex-col items-center gap-3 overflow-hidden" style={{ maxWidth: 520 }}>
          {previewAlerts.map((a, i) => (
            <AlertCard key={i} alert={a} accent={accentColor} sizeScale={sizeScale} textScale={textScale} textColor={textColor} />
          ))}
        </div>
        <p className="text-[10px] text-zinc-600 mt-3 text-center">
          Zmień kolor akcentu poniżej — podgląd zaktualizuje się od razu.
        </p>
      </div>

      {/* Overlay token + OBS URL */}
      <div className="border border-zinc-800 bg-black/30 p-3 mb-3 space-y-2">
        {data.overlayToken ? (
          <>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">
                Overlay token (sekret)
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setTokenVisible((v) => !v)}
                  className="text-[10px] font-mono uppercase tracking-widest text-zinc-400 hover:text-white border border-zinc-800 hover:border-zinc-700 px-2 py-0.5 transition-colors flex items-center gap-1"
                  title={tokenVisible ? "Ukryj" : "Pokaż"}
                >
                  {tokenVisible ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                  {tokenVisible ? "Ukryj" : "Pokaż"}
                </button>
                <button
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(data.overlayToken ?? "");
                      setTokenCopied(true);
                      setTimeout(() => setTokenCopied(false), 1500);
                    } catch { onToast("err", "Schowek niedostępny"); }
                  }}
                  className="text-[10px] font-mono uppercase tracking-widest text-zinc-400 hover:text-white border border-zinc-800 hover:border-zinc-700 px-2 py-0.5 transition-colors flex items-center gap-1"
                >
                  <Copy className="w-3 h-3" />
                  {tokenCopied ? "Skopiowano" : "Token"}
                </button>
                <button
                  onClick={async () => {
                    if (!confirm("Wygenerować nowy token? Stare URL-e do OBS przestaną działać — będziesz musiał wkleić nowy URL do OBS Browser Source.")) return;
                    setBusy(true);
                    try {
                      const res = await fetch("/api/admin/alerts", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ action: "regenerate_token" }),
                      });
                      const result = await res.json();
                      if (!res.ok) onToast("err", result.error ?? "Błąd");
                      else { onToast("ok", "Nowy token wygenerowany — wklej nowy URL do OBS"); onSuccess(); }
                    } finally { setBusy(false); }
                  }}
                  disabled={busy || pending}
                  className="text-[10px] font-mono uppercase tracking-widest text-orange-300 hover:text-orange-200 border border-orange-900 hover:border-orange-700 px-2 py-0.5 disabled:opacity-50 transition-colors flex items-center gap-1"
                  title="Rotacja tokena — unieważnia stare URL-e"
                >
                  <Zap className="w-3 h-3" />
                  Wygeneruj nowy
                </button>
              </div>
            </div>
            <div className="font-mono text-[10px] text-zinc-300 break-all bg-black/40 border border-zinc-900 p-2">
              {tokenVisible ? data.overlayToken : "•".repeat(Math.min(data.overlayToken.length, 64))}
            </div>

            <div className="pt-1">
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">
                  URL dla OBS Browser Source
                </span>
                <button
                  onClick={async () => {
                    const url = `${window.location.origin}/overlay?token=${data.overlayToken}`;
                    try {
                      await navigator.clipboard.writeText(url);
                      setUrlCopied(true);
                      setTimeout(() => setUrlCopied(false), 1500);
                    } catch { onToast("err", "Schowek niedostępny"); }
                  }}
                  className="text-[10px] font-mono uppercase tracking-widest text-red-400 hover:text-red-300 border border-red-900 hover:border-red-700 bg-red-950/30 px-2 py-0.5 transition-colors flex items-center gap-1"
                >
                  <Copy className="w-3 h-3" />
                  {urlCopied ? "Skopiowano!" : "Kopiuj URL"}
                </button>
              </div>
              <div className="font-mono text-[10px] text-zinc-400 break-all bg-black/40 border border-zinc-900 p-2">
                {typeof window !== "undefined" ? window.location.origin : "https://ghost-empire-web.vercel.app"}
                /overlay?token={tokenVisible ? data.overlayToken : "•".repeat(8) + "..."}
              </div>
              <p className="text-[10px] text-zinc-500 mt-1.5">
                Wklej ten URL jako <strong>Browser Source</strong> w OBS (rozmiar 1920×1080, transparent background = ON, refresh on activate = ON).
              </p>
            </div>
          </>
        ) : (
          <div className="text-[11px] text-orange-300">
            ⚠ Brak tokena overlay w bazie. Odśwież stronę — powinien się auto-wygenerować przy pierwszym wejściu na sekcję.
          </div>
        )}
      </div>

      {/* Test alert button */}
      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={sendTest}
          disabled={busy || pending}
          className="px-3 py-1.5 bg-red-700 hover:bg-red-600 text-white text-[10px] font-bold tracking-widest uppercase disabled:opacity-50 flex items-center gap-1.5"
        >
          {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
          Wyślij test alert
        </button>
        <span className="text-[10px] text-zinc-500">
          Zobaczysz alert na overlay w ciągu ~1.5s.
        </span>
      </div>

      {/* Settings */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <div>
          <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-1">
            Rozmiar alertu
          </label>
          <div className="flex items-center gap-2">
            <input
              type="range" min={50} max={200} step={5}
              value={Math.round(sizeScale * 100)}
              onChange={(e) => setSizeScale(parseInt(e.target.value, 10) / 100)}
              className="flex-1"
            />
            <span className="text-xs text-white font-mono tabular-nums w-12 text-right">{Math.round(sizeScale * 100)}%</span>
          </div>
        </div>
        <div>
          <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-1">
            Rozmiar tekstu
          </label>
          <div className="flex items-center gap-2">
            <input
              type="range" min={50} max={200} step={5}
              value={Math.round(textScale * 100)}
              onChange={(e) => setTextScale(parseInt(e.target.value, 10) / 100)}
              className="flex-1"
            />
            <span className="text-xs text-white font-mono tabular-nums w-12 text-right">{Math.round(textScale * 100)}%</span>
          </div>
        </div>
        <div>
          <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-1">
            Kolor tekstu
          </label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={textColor}
              onChange={(e) => setTextColor(e.target.value)}
              className="w-10 h-8 border border-zinc-800 bg-black/30 cursor-pointer"
            />
            <input
              type="text"
              value={textColor}
              onChange={(e) => setTextColor(e.target.value)}
              className="flex-1 border border-zinc-800 bg-black/30 px-2 py-1.5 text-xs font-mono text-white outline-hidden focus:border-red-600"
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <div className="md:col-span-1">
          <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-1">
            Czas wyświetlania
          </label>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={1500}
              max={20000}
              step={500}
              value={durationMs}
              onChange={(e) => setDurationMs(parseInt(e.target.value, 10))}
              className="flex-1"
            />
            <span className="text-xs text-white font-mono tabular-nums w-14 text-right">
              {(durationMs / 1000).toFixed(1)}s
            </span>
          </div>
        </div>

        <div>
          <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-1">
            Kolor akcentu
          </label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={accentColor}
              onChange={(e) => setAccentColor(e.target.value)}
              className="w-10 h-8 border border-zinc-800 bg-black/30 cursor-pointer"
            />
            <input
              type="text"
              value={accentColor}
              onChange={(e) => setAccentColor(e.target.value)}
              className="flex-1 border border-zinc-800 bg-black/30 px-2 py-1.5 text-xs font-mono text-white outline-hidden focus:border-red-600"
            />
          </div>
        </div>

        <div>
          <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-1">
            Dźwięk
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={soundEnabled}
              onChange={(e) => setSoundEnabled(e.target.checked)}
              className="w-4 h-4 accent-red-600"
            />
            <span className="text-xs text-zinc-300">
              {soundEnabled ? "Włączony (chime)" : "Wyłączony"}
            </span>
          </label>
        </div>
      </div>

      {/* Per-type: enable/disable + click to customize (animation/position/sound/threshold) */}
      <AlertTypeList enabledTypes={enabledTypes} onToggle={toggleType} onToast={onToast} />

      {/* Save button */}
      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={saveSettings}
          disabled={!dirty || busy || pending}
          className="px-3 py-1.5 bg-purple-700 hover:bg-purple-600 text-white text-[10px] font-bold tracking-widest uppercase disabled:opacity-40 flex items-center gap-1.5"
        >
          {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
          {dirty ? "Zapisz zmiany" : "Brak zmian"}
        </button>
      </div>

      {/* Recent alerts log */}
      {data.recent.length > 0 && (
        <>
          <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-2">
            Ostatnie alerty ({data.recent.length})
          </div>
          <div className="space-y-1 text-[10px] font-mono">
            {data.recent.slice(0, 10).map((a) => (
              <div key={a.id} className="flex items-center gap-2 border-l-2 border-zinc-800 pl-2 py-1">
                <span className="text-zinc-500 uppercase tracking-widest w-28 truncate shrink-0">
                  {ALERT_TYPE_LABEL[a.type] ?? a.type}
                </span>
                <span className="text-zinc-300 truncate flex-1">
                  {a.icon ?? "🔔"} {a.actorName ? <strong>{a.actorName.includes(" ") ? a.actorName.split(" ")[0] : a.actorName}</strong> : null} {a.message}
                </span>
                {a.amount != null && (
                  <span className="text-red-400 shrink-0">
                    {a.amount.toLocaleString("pl-PL")}{a.amountLabel ? ` ${a.amountLabel}` : ""}
                  </span>
                )}
                <span
                  className={cn(
                    "shrink-0 text-[9px] uppercase tracking-widest",
                    a.shownAt ? "text-zinc-600" : "text-orange-400",
                  )}
                  title={a.shownAt ? `Pokazany ${new Date(a.shownAt).toLocaleTimeString("pl-PL")}` : "Jeszcze nie pokazany"}
                >
                  {a.shownAt ? "shown" : "pending"}
                </span>
                <span className="text-zinc-700 shrink-0">
                  {new Date(a.createdAt).toLocaleTimeString("pl-PL")}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </SectionCard>
  );
}
