"use client";
// src/components/admin/sections/Rumble.tsx — per-portal Rumble platform (#730).
// The streamer pastes their Rumble Livestream API URL (with the embedded key); it's stored
// encrypted (IntegrationConfig.rumbleApiUrl) and drives the /overlay/rumble overlay + the
// live-status readout here. Data via /api/admin/rumble.
import { useState, useEffect, useCallback } from "react";
import { Tv, Loader2, Radio, KeyRound, Check, Users, Eye } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { SectionCard } from "../shared";
import { apiGet, apiPost, ApiError } from "@/lib/api-client";

type RumbleStatus = {
  configured: boolean;
  live: boolean;
  followers: number;
  subscribers: number;
  title: string | null;
  watching: number;
};

type Meta = { hasUrl: boolean; status: RumbleStatus };

export function RumbleManager({ onToast }: { onToast: (k: "ok" | "err", m: string) => void }) {
  const t = useTranslations("admin.rumble");
  const locale = useLocale();
  const nf = new Intl.NumberFormat(locale);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<null | "save" | "clear">(null);
  const [url, setUrl] = useState("");

  const load = useCallback(async () => {
    try {
      const d = await apiGet<Meta>("/api/admin/rumble");
      setMeta(d);
    } catch {
      /* keep last */
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    if (!url.trim()) {
      onToast("err", t("urlRequired"));
      return;
    }
    setBusy("save");
    try {
      await apiPost("/api/admin/rumble", { rumbleApiUrl: url.trim() });
      onToast("ok", t("saved"));
      setUrl("");
      await load();
    } catch (e) {
      onToast("err", e instanceof ApiError ? e.message : t("err"));
    }
    setBusy(null);
  }

  async function clear() {
    if (!confirm(t("clearConfirm"))) return;
    setBusy("clear");
    try {
      await apiPost("/api/admin/rumble", { rumbleApiUrl: null });
      onToast("ok", t("cleared"));
      setUrl("");
      await load();
    } catch (e) {
      onToast("err", e instanceof ApiError ? e.message : t("err"));
    }
    setBusy(null);
  }

  const s = meta?.status;
  const configured = !!meta?.hasUrl;

  return (
    <SectionCard title={t("title")} icon={Tv}>
      <p className="text-zinc-500 text-xs mb-3 leading-relaxed">{t("intro")}</p>

      {/* Live status */}
      <div className="border border-zinc-800 bg-black/30 p-3 mb-3">
        {loading ? (
          <div className="text-xs text-zinc-500 flex items-center gap-2">
            <Loader2 className="w-3 h-3 animate-spin" /> {t("loading")}
          </div>
        ) : !configured ? (
          <div className="text-xs text-zinc-500 text-center py-2">{t("notConfigured")}</div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-bold tracking-widest uppercase ${
                  s?.live ? "bg-green-600/20 text-green-300 border border-green-700/50" : "bg-zinc-800 text-zinc-400 border border-zinc-700"
                }`}
              >
                <Radio className={`w-3 h-3 ${s?.live ? "animate-pulse" : ""}`} /> {s?.live ? t("live") : t("offline")}
              </span>
              {s?.live && s.title && <span className="text-sm text-white truncate min-w-0">{s.title}</span>}
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="border border-zinc-800 bg-black/20 p-2">
                <div className="text-[9px] font-mono uppercase tracking-widest text-zinc-500 flex items-center justify-center gap-1"><Users className="w-3 h-3" /> {t("followers")}</div>
                <div className="text-sm font-bold text-white mt-0.5">{nf.format(s?.followers ?? 0)}</div>
              </div>
              <div className="border border-zinc-800 bg-black/20 p-2">
                <div className="text-[9px] font-mono uppercase tracking-widest text-zinc-500">{t("subscribers")}</div>
                <div className="text-sm font-bold text-white mt-0.5">{nf.format(s?.subscribers ?? 0)}</div>
              </div>
              <div className="border border-zinc-800 bg-black/20 p-2">
                <div className="text-[9px] font-mono uppercase tracking-widest text-zinc-500 flex items-center justify-center gap-1"><Eye className="w-3 h-3" /> {t("watching")}</div>
                <div className="text-sm font-bold text-white mt-0.5">{s?.live ? nf.format(s?.watching ?? 0) : "—"}</div>
              </div>
            </div>
            <button
              onClick={() => void load()}
              className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 hover:text-zinc-300"
            >
              {t("refresh")}
            </button>
          </div>
        )}
      </div>

      {/* API URL config — the URL embeds the key, so treat it as a secret */}
      <div className="border border-zinc-800 bg-black/30 p-3 space-y-2">
        <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 flex items-center gap-2">
          <KeyRound className="w-3 h-3" /> {t("urlLabel")}
          {configured && <span className="text-green-500 normal-case tracking-normal">✓ {t("urlSet")}</span>}
        </label>
        <input
          type="password"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder={configured ? t("overwritePh") : t("urlPh")}
          autoComplete="off"
          className="w-full bg-black border border-zinc-800 px-3 py-2 text-sm text-white font-mono outline-hidden focus:border-green-600"
        />
        <p className="text-[10px] text-zinc-600 leading-relaxed">{t("urlHint")}</p>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void save()}
            disabled={busy !== null}
            className="px-3 py-1.5 bg-green-700 hover:bg-green-600 text-white text-[10px] font-bold tracking-widest uppercase disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            {busy === "save" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} {t("saveBtn")}
          </button>
          {configured && (
            <button
              onClick={() => void clear()}
              disabled={busy !== null}
              className="px-2.5 py-1.5 border border-zinc-700 text-zinc-400 hover:border-red-500 hover:text-red-400 text-[10px] font-mono uppercase disabled:opacity-50"
            >
              {t("clearBtn")}
            </button>
          )}
        </div>
      </div>
    </SectionCard>
  );
}
