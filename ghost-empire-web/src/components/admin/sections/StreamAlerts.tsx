"use client";
// src/components/admin/sections/StreamAlerts.tsx — lazily-loaded Stream Alerts (OBS overlay)
// manager: live preview, overlay token/URL, per-type config (AlertTypeList) and settings.
import { useState, useEffect } from "react";
import { Zap, Eye, EyeOff, Copy, Loader2, Check } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { cn } from "@/lib/utils";
import { SectionCard } from "../shared";
import { apiGet, apiPost, ApiError } from "@/lib/api-client";
import { AlertCard } from "@/components/AlertCard";
import {
  ALERT_TYPE_LIST,
  ALERT_ANIMATIONS,
  ALERT_POSITIONS,
  type AlertAnimation,
  type AlertPosition,
} from "@/lib/alert-types";
import { useTenantBranding } from "@/components/TenantBranding";
import type { StreamAlertsData } from "../types";

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
  const t = useTranslations("admin.streamAlerts");
  const ANIMATION_LABELS: Record<AlertAnimation, string> = {
    slide: t("animation.slide"), fade: t("animation.fade"), scale: t("animation.scale"), none: t("animation.none"),
  };
  const POSITION_LABELS: Record<AlertPosition, string> = {
    "top-left": t("position.top-left"), "top-center": t("position.top-center"), "top-right": t("position.top-right"),
    center: t("position.center"), "bottom-left": t("position.bottom-left"), "bottom-center": t("position.bottom-center"), "bottom-right": t("position.bottom-right"),
  };
  const typeLabel = (ty: string, fb: string) => (t.has(`alertType.${ty}`) ? t(`alertType.${ty}`) : fb);
  const [rows, setRows] = useState<AlertTypeRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [savingType, setSavingType] = useState<string | null>(null);
  const [openType, setOpenType] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiGet<{ types?: AlertTypeRow[] }>("/api/admin/alert-types")
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
      await apiPost("/api/admin/alert-types", {
        type: row.type,
        animation: row.animation,
        position: row.position,
        soundUrl: row.soundUrl,
        minAmount: row.minAmount,
      });
      onToast("ok", t("savedType", { label: typeLabel(row.type, row.label) })); patch(row.type, "configured", true);
    } catch (err) {
      if (err instanceof ApiError && err.status !== 0) onToast("err", err.message || t("err"));
      else onToast("err", t("netErr"));
    } finally {
      setSavingType(null);
    }
  }

  return (
    <div className="mb-4">
      <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-2">
        {t("typesHeader", { count: enabledTypes.length })}
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
                  title={active ? t("disableType") : t("enableType")}
                  className={cn("text-base leading-none shrink-0", active ? "text-red-400" : "text-zinc-600 hover:text-zinc-400")}
                >
                  {active ? "●" : "○"}
                </button>
                <button
                  type="button"
                  onClick={() => setOpenType(open ? null : type)}
                  className="flex-1 flex items-center justify-between gap-2 text-left"
                >
                  <span className={cn("text-xs", active ? "text-zinc-200" : "text-zinc-500")}>{typeLabel(type, label)}</span>
                  <span className="flex items-center gap-2 shrink-0">
                    {row?.configured && <span className="text-[9px] font-mono uppercase tracking-widest text-green-500">{t("customBadge")}</span>}
                    <span className="text-zinc-500 text-[10px]">{open ? "▴" : "▾"}</span>
                  </span>
                </button>
              </div>
              {open && (
                <div className="border-t border-zinc-800/70 p-2.5">
                  {!row ? (
                    <p className="text-zinc-600 text-[10px]">{t("loadingSettings")}</p>
                  ) : (
                    <>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-1">{t("animationLabel")}</label>
                          <select value={row.animation} onChange={(e) => patch(type, "animation", e.target.value)} className="w-full bg-black border border-zinc-800 px-2 py-1.5 text-xs text-white outline-hidden focus:border-red-500">
                            {ALERT_ANIMATIONS.map((a) => <option key={a} value={a}>{ANIMATION_LABELS[a]}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-1">{t("positionLabel")}</label>
                          <select value={row.position} onChange={(e) => patch(type, "position", e.target.value)} className="w-full bg-black border border-zinc-800 px-2 py-1.5 text-xs text-white outline-hidden focus:border-red-500">
                            {ALERT_POSITIONS.map((p) => <option key={p} value={p}>{POSITION_LABELS[p]}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-1">{t("soundLabel")}</label>
                          <input type="text" value={row.soundUrl ?? ""} onChange={(e) => patch(type, "soundUrl", e.target.value || null)} placeholder="https://…/sound.mp3" className="w-full bg-black border border-zinc-800 px-2 py-1.5 text-xs text-white outline-hidden focus:border-red-500" />
                        </div>
                        <div>
                          <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-1">{t("thresholdLabel")}</label>
                          <input type="number" min={0} value={row.minAmount ?? ""} onChange={(e) => patch(type, "minAmount", e.target.value === "" ? null : Math.max(0, parseInt(e.target.value) || 0))} placeholder={t("thresholdPh")} className="w-full bg-black border border-zinc-800 px-2 py-1.5 text-xs text-white outline-hidden focus:border-red-500" />
                        </div>
                      </div>
                      <button
                        onClick={() => save(row)}
                        disabled={savingType === type || !loaded}
                        className="mt-2 px-3 py-1.5 bg-green-700 hover:bg-green-600 text-white text-[10px] font-bold tracking-widest uppercase transition-all disabled:opacity-50 inline-flex items-center gap-1.5"
                      >
                        {savingType === type ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                        {t("saveSettingsBtn")}
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
  const t = useTranslations("admin.streamAlerts");
  const nf = useLocale();
  const { tokenSymbol } = useTenantBranding();
  const ALERT_TYPE_LABEL: Record<string, string> = {
    shop_purchase: t("alertType.shop_purchase"), event_win: t("alertType.event_win"), drop_claim_bonus: t("alertType.drop_claim_bonus"),
    twitch_sub: t("alertType.twitch_sub"), twitch_gift_sub: t("alertType.twitch_gift_sub"), twitch_cheer: t("alertType.twitch_cheer"),
    donation: t("alertType.donation"), welcome: t("alertType.welcome"), level_up: t("alertType.level_up"), test: t("alertType.test"),
  };
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
    { title: t("prevAlert1Title"), message: t("prevAlert1Msg"), icon: "💜", actorName: t("prevAlert1Actor"), amount: 5000, amountLabel: tokenSymbol },
    { title: t("prevAlert2Title"), message: t("prevAlert2Msg"), icon: "💰", actorName: t("prevAlert2Actor"), amount: 20, amountLabel: "PLN" },
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
      await apiPost("/api/admin/alerts", {
        action: "settings",
        enabledTypes,
        durationMs,
        accentColor,
        soundEnabled,
        sizeScale,
        textScale,
        textColor,
      });
      onToast("ok", t("saved"));
      onSuccess();
    } catch (err) {
      onToast("err", err instanceof ApiError ? (err.message || t("err")) : t("err"));
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    setBusy(true);
    try {
      await apiPost("/api/admin/alerts", { action: "test" });
      onToast("ok", t("testSent"));
    } catch (err) {
      onToast("err", err instanceof ApiError ? (err.message || t("err")) : t("err"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SectionCard title={t("secTitle")} icon={Zap}>
      <p className="text-zinc-500 text-xs mb-3">
        {t("intro")}
      </p>

      {/* Live preview — reflects the accent color picked below */}
      <div className="border border-zinc-800 bg-black/40 p-4 mb-3">
        <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-3">
          {t("previewHeader")}
        </div>
        <div className="mx-auto flex flex-col items-center gap-3 overflow-hidden" style={{ maxWidth: 520 }}>
          {previewAlerts.map((a, i) => (
            <AlertCard key={i} alert={a} accent={accentColor} sizeScale={sizeScale} textScale={textScale} textColor={textColor} />
          ))}
        </div>
        <p className="text-[10px] text-zinc-600 mt-3 text-center">
          {t("previewHint")}
        </p>
      </div>

      {/* Overlay token + OBS URL */}
      <div className="border border-zinc-800 bg-black/30 p-3 mb-3 space-y-2">
        {data.overlayToken ? (
          <>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">
                {t("tokenLabel")}
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setTokenVisible((v) => !v)}
                  className="text-[10px] font-mono uppercase tracking-widest text-zinc-400 hover:text-white border border-zinc-800 hover:border-zinc-700 px-2 py-0.5 transition-colors flex items-center gap-1"
                  title={tokenVisible ? t("hide") : t("show")}
                >
                  {tokenVisible ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                  {tokenVisible ? t("hide") : t("show")}
                </button>
                <button
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(data.overlayToken ?? "");
                      setTokenCopied(true);
                      setTimeout(() => setTokenCopied(false), 1500);
                    } catch { onToast("err", t("clipboardError")); }
                  }}
                  className="text-[10px] font-mono uppercase tracking-widest text-zinc-400 hover:text-white border border-zinc-800 hover:border-zinc-700 px-2 py-0.5 transition-colors flex items-center gap-1"
                >
                  <Copy className="w-3 h-3" />
                  {tokenCopied ? t("copied") : t("tokenBtn")}
                </button>
                <button
                  onClick={async () => {
                    if (!confirm(t("regenConfirm"))) return;
                    setBusy(true);
                    try {
                      await apiPost("/api/admin/alerts", { action: "regenerate_token" });
                      onToast("ok", t("tokenRegenerated")); onSuccess();
                    } catch (err) {
                      onToast("err", err instanceof ApiError ? (err.message || t("err")) : t("err"));
                    } finally { setBusy(false); }
                  }}
                  disabled={busy || pending}
                  className="text-[10px] font-mono uppercase tracking-widest text-orange-300 hover:text-orange-200 border border-orange-900 hover:border-orange-700 px-2 py-0.5 disabled:opacity-50 transition-colors flex items-center gap-1"
                  title={t("regenTitle")}
                >
                  <Zap className="w-3 h-3" />
                  {t("regenBtn")}
                </button>
              </div>
            </div>
            <div className="font-mono text-[10px] text-zinc-300 break-all bg-black/40 border border-zinc-900 p-2">
              {tokenVisible ? data.overlayToken : "•".repeat(Math.min(data.overlayToken.length, 64))}
            </div>

            <div className="pt-1">
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">
                  {t("urlLabel")}
                </span>
                <button
                  onClick={async () => {
                    const url = `${window.location.origin}/overlay?token=${data.overlayToken}`;
                    try {
                      await navigator.clipboard.writeText(url);
                      setUrlCopied(true);
                      setTimeout(() => setUrlCopied(false), 1500);
                    } catch { onToast("err", t("clipboardError")); }
                  }}
                  className="text-[10px] font-mono uppercase tracking-widest text-red-400 hover:text-red-300 border border-red-900 hover:border-red-700 bg-red-950/30 px-2 py-0.5 transition-colors flex items-center gap-1"
                >
                  <Copy className="w-3 h-3" />
                  {urlCopied ? t("copiedUrl") : t("copyUrl")}
                </button>
              </div>
              <div className="font-mono text-[10px] text-zinc-400 break-all bg-black/40 border border-zinc-900 p-2">
                {typeof window !== "undefined" ? window.location.origin : "https://ghost-empire-web.vercel.app"}
                /overlay?token={tokenVisible ? data.overlayToken : "•".repeat(8) + "..."}
              </div>
              <p className="text-[10px] text-zinc-500 mt-1.5">
                {t.rich("urlNote", { b: (c) => <strong>{c}</strong> })}
              </p>
            </div>
          </>
        ) : (
          <div className="text-[11px] text-orange-300">
            {t("noToken")}
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
          {t("testBtn")}
        </button>
        <span className="text-[10px] text-zinc-500">
          {t("testHint")}
        </span>
      </div>

      {/* Settings */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <div>
          <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-1">
            {t("sizeLabel")}
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
            {t("textSizeLabel")}
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
            {t("textColorLabel")}
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
            {t("durationLabel")}
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
            {t("accentLabel")}
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
            {t("soundHeading")}
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={soundEnabled}
              onChange={(e) => setSoundEnabled(e.target.checked)}
              className="w-4 h-4 accent-red-600"
            />
            <span className="text-xs text-zinc-300">
              {soundEnabled ? t("soundOn") : t("soundOff")}
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
          {dirty ? t("saveChanges") : t("noChanges")}
        </button>
      </div>

      {/* Recent alerts log */}
      {data.recent.length > 0 && (
        <>
          <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-2">
            {t("recentTitle", { count: data.recent.length })}
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
                    {a.amount.toLocaleString(nf)}{a.amountLabel ? ` ${a.amountLabel}` : ""}
                  </span>
                )}
                <span
                  className={cn(
                    "shrink-0 text-[9px] uppercase tracking-widest",
                    a.shownAt ? "text-zinc-600" : "text-orange-400",
                  )}
                  title={a.shownAt ? t("shownAt", { time: new Date(a.shownAt).toLocaleTimeString(nf) }) : t("notShown")}
                >
                  {a.shownAt ? "shown" : "pending"}
                </span>
                <span className="text-zinc-700 shrink-0">
                  {new Date(a.createdAt).toLocaleTimeString(nf)}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </SectionCard>
  );
}
