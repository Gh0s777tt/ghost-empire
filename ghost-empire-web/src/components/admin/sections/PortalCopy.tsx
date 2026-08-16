"use client";
// src/components/admin/sections/PortalCopy.tsx
// Edytor treści portalu (update 2026-08): pozwala streamerowi opisać własną społeczność SWOIMI
// słowami, zamiast dzielić jeden tekst powitalny ze wszystkimi portalami na platformie.
//
// Zakres jest celowo wąski — pola pochodzą z zamkniętej listy (`lib/tenant-copy`), a regulamin
// i polityka prywatności są poza zasięgiem panelu (podlegają polskiemu prawu i przeglądowi
// prawnika — patrz CLAUDE.md).
import { useState, useEffect, useCallback } from "react";
import { Languages, Loader2, Save, RotateCcw } from "lucide-react";
import { useTranslations } from "next-intl";
import { SectionCard } from "../shared";
import { apiGet, apiPost, ApiError } from "@/lib/api-client";

type Pole = { key: string; max: number; value: string };

const LOCALES = ["pl", "en", "de", "es", "fr", "id", "it", "ja", "ko", "pt", "ru", "uk", "zh", "ar"];

export function PortalCopy({ onToast }: { onToast: (k: "ok" | "err", m: string) => void }) {
  const t = useTranslations("admin.portalCopy");
  const [locale, setLocale] = useState("pl");
  const [pola, setPola] = useState<Pole[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (loc: string) => {
    setLoading(true);
    try {
      const d = await apiGet<{ fields: Pole[] }>(`/api/admin/tenant-copy?locale=${loc}`);
      setPola(d.fields);
    } catch {
      setPola([]);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(locale); }, [load, locale]);

  function zmien(key: string, value: string) {
    setPola((p) => p.map((f) => (f.key === key ? { ...f, value } : f)));
  }

  async function zapisz() {
    setBusy(true);
    try {
      await apiPost("/api/admin/tenant-copy", {
        locale,
        values: Object.fromEntries(pola.map((f) => [f.key, f.value])),
      });
      onToast("ok", t("saved"));
    } catch (e) {
      onToast("err", e instanceof ApiError ? e.message : t("err"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SectionCard title={t("title")} icon={Languages}>
      <p className="text-zinc-500 text-xs mb-3">{t("intro")}</p>

      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">{t("language")}</span>
        {LOCALES.map((l) => (
          <button
            key={l}
            onClick={() => setLocale(l)}
            className={`px-2 py-0.5 text-[11px] font-mono uppercase border rounded ${l === locale ? "border-red-600 bg-red-950/40 text-white" : "border-zinc-800 text-zinc-500 hover:border-zinc-600"}`}
          >
            {l}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-xs text-zinc-500 flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin" /> {t("loading")}</div>
      ) : (
        <div className="space-y-3">
          {pola.map((f) => (
            <div key={f.key}>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">{f.key}</label>
                <span className={`text-[10px] font-mono ${f.value.length > f.max ? "text-red-400" : "text-zinc-600"}`}>
                  {f.value.length}/{f.max}
                </span>
              </div>
              <textarea
                value={f.value}
                onChange={(e) => zmien(f.key, e.target.value)}
                rows={f.max > 100 ? 2 : 1}
                placeholder={t("defaultPlaceholder")}
                className="w-full bg-black border border-zinc-800 px-2 py-1.5 text-sm text-white outline-hidden focus:border-red-500 resize-y"
              />
            </div>
          ))}

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => void zapisz()}
              disabled={busy || pola.some((f) => f.value.length > f.max)}
              className="px-3 py-1.5 bg-red-700 hover:bg-red-600 text-white text-[10px] font-bold tracking-widest uppercase disabled:opacity-50 inline-flex items-center gap-1.5"
            >
              {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />} {t("save")}
            </button>
            <button
              onClick={() => setPola((p) => p.map((f) => ({ ...f, value: "" })))}
              className="px-2 h-7 text-[10px] font-bold uppercase tracking-widest border border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-600 inline-flex items-center gap-1"
              title={t("resetHint")}
            >
              <RotateCcw className="w-3 h-3" /> {t("reset")}
            </button>
          </div>

          <p className="text-[10px] text-zinc-600">{t("hint")}</p>
        </div>
      )}
    </SectionCard>
  );
}
