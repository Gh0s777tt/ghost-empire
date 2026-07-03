"use client";
// src/components/admin/SetupWizard.tsx
// Guided "go-live" setup wizard (#738) — a modal that walks a new streamer through the essential
// config (connect Twitch, EventSub, overlay token…) instead of leaving them to hunt 51 sections.
// Step completion is DERIVED from real config server-side (/api/admin/setup-status), so it
// self-heals: configure something anywhere and the step ticks. "Configure" deep-links to the
// matching admin section; "Skip" snoozes; "Finish" marks the wizard done.
import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { X, ArrowRight, CheckCircle2, Rocket, Loader2, Copy, Check } from "lucide-react";
import { useFocusTrap } from "@/lib/use-focus-trap";
import { apiGet, apiPost } from "@/lib/api-client";
import { cn } from "@/lib/utils";

type Item = { key: string; label: string; hint: string; ok: boolean; section: string; optional: boolean };
type Progress = { requiredDone: number; requiredTotal: number; doneAll: number; totalAll: number; allRequiredDone: boolean; percent: number };
type Data = { items: Item[]; progress: Progress };

export function SetupWizard({ onJump, onClose }: { onJump: (section: string) => void; onClose: () => void }) {
  const t = useTranslations("admin.setupWizard");
  const ts = useTranslations("admin.setupStatus");
  const [data, setData] = useState<Data | null>(null);
  const [live, setLive] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null); // step with its inline mini-form open
  const [obsUrl, setObsUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const dismiss = useCallback(async () => {
    try { await apiPost("/api/admin/setup-status", { action: "dismiss" }); } catch { /* best-effort */ }
    onClose();
  }, [onClose]);

  const ref = useFocusTrap<HTMLDivElement>(true, { onEscape: () => void dismiss() });

  useEffect(() => {
    apiGet<Data>("/api/admin/setup-status").then(setData).catch(() => { /* keep loading */ });
  }, []);

  async function finish() {
    try { await apiPost("/api/admin/setup-status", { action: "complete" }); } catch { /* best-effort */ }
    setLive(true);
  }

  const refetch = useCallback(() => { apiGet<Data>("/api/admin/setup-status").then(setData).catch(() => { /* keep current */ }); }, []);

  // The OBS overlay step gets an inline mini-form (#739): GET /api/admin/overlay-token lazily
  // GENERATES the token, so just fetching it satisfies the step — then we re-derive to tick it.
  async function openOverlay() {
    setExpanded((e) => (e === "overlay" ? null : "overlay"));
    if (!obsUrl) {
      try {
        const r = await apiGet<{ token: string }>("/api/admin/overlay-token");
        if (r.token) setObsUrl(`${window.location.origin}/overlay?token=${r.token}`);
      } catch { /* overlays gated / failed — user can still use the section deep-link */ }
    }
  }
  function copyUrl() {
    if (!obsUrl) return;
    navigator.clipboard?.writeText(obsUrl).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {});
  }

  const label = (i: Item) => (ts.has(`item.${i.key}.label`) ? ts(`item.${i.key}.label`) : i.label);
  const hint = (i: Item) => (ts.has(`item.${i.key}.hint`) ? ts(`item.${i.key}.hint`) : i.hint);
  const required = data?.items.filter((i) => !i.optional) ?? [];
  const optional = data?.items.filter((i) => i.optional) ?? [];

  function Step({ i }: { i: Item }) {
    const isOverlay = i.key === "overlay";
    return (
      <>
        <div className="flex items-center gap-3 py-2.5 border-b border-zinc-900 last:border-0">
          {i.ok ? <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" /> : <span className="w-4 h-4 rounded-full border border-zinc-700 shrink-0" aria-hidden />}
          <div className="flex-1 min-w-0">
            <div className={cn("text-sm", i.ok ? "text-zinc-500" : "text-white")}>{label(i)}</div>
            {!i.ok && <div className="text-[11px] text-zinc-500">{hint(i)}</div>}
          </div>
          {i.ok ? (
            <span className="text-[11px] text-green-500 inline-flex items-center gap-1 shrink-0"><CheckCircle2 className="w-3.5 h-3.5" /> {t("doneTag")}</span>
          ) : (
            <button
              onClick={() => { if (isOverlay) void openOverlay(); else { onJump(i.section); onClose(); } }}
              className="text-[11px] font-mono uppercase tracking-widest text-zinc-300 hover:text-white border border-zinc-700 hover:border-zinc-500 px-2.5 py-1.5 inline-flex items-center gap-1 shrink-0 transition-colors"
            >
              {t("configure")} <ArrowRight className="w-3 h-3" />
            </button>
          )}
        </div>
        {isOverlay && !i.ok && expanded === "overlay" && (
          <div className="pl-7 pb-3">
            <div className="text-[11px] text-zinc-500 mb-2">{t("obsHint")}</div>
            <div className="flex gap-2 flex-wrap">
              <input
                readOnly
                value={obsUrl ?? t("loading")}
                onFocus={(e) => e.currentTarget.select()}
                className="flex-1 min-w-[180px] bg-black border border-zinc-800 px-2.5 py-1.5 text-[12px] text-zinc-300 font-mono outline-hidden"
              />
              <button onClick={copyUrl} disabled={!obsUrl} className="px-2.5 py-1.5 border border-zinc-700 hover:border-zinc-500 text-zinc-300 text-[11px] inline-flex items-center gap-1 disabled:opacity-40">
                {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />} {copied ? t("copied") : t("copy")}
              </button>
              <button onClick={() => { setExpanded(null); refetch(); }} className="px-2.5 py-1.5 bg-red-700 hover:bg-red-600 text-white text-[11px] font-bold uppercase tracking-widest">
                {t("obsDone")}
              </button>
            </div>
            {/* A8 — the wizard only hands the base alerts URL; point streamers at the full overlay
                library (27 widgets) they'd otherwise never discover. */}
            <button onClick={() => { onJump("widgets"); onClose(); }} className="mt-2 text-[11px] text-zinc-400 hover:text-white inline-flex items-center gap-1">
              {t("obsMore")} <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        )}
      </>
    );
  }

  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-label={t("title")}>
      <div ref={ref} className="w-full max-w-lg bg-zinc-950 border border-zinc-800 max-h-[90vh] overflow-y-auto">
        {live ? (
          <div className="p-10 text-center">
            <Rocket className="w-9 h-9 text-green-400 mx-auto" />
            <div className="text-lg font-bold text-white mt-3">{t("live")}</div>
            <p className="text-sm text-zinc-400 mt-1">{t("liveDesc")}</p>
            <button onClick={onClose} className="mt-5 px-4 py-2 bg-red-700 hover:bg-red-600 text-white text-xs font-bold tracking-widest uppercase">{t("close")}</button>
          </div>
        ) : !data ? (
          <div className="p-10 text-center text-zinc-500 flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> {t("loading")}</div>
        ) : (
          <>
            <div className="p-5 border-b border-zinc-800 flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="font-mono text-[11px] tracking-[0.16em] uppercase text-red-500">{t("eyebrow")}</div>
                <h2 className="text-lg font-bold text-white mt-0.5">{t("title")}</h2>
                <p className="text-sm text-zinc-400 mt-0.5">{t("subtitle")}</p>
              </div>
              <button onClick={() => void dismiss()} aria-label={t("skip")} className="text-zinc-500 hover:text-white shrink-0"><X className="w-5 h-5" /></button>
            </div>

            <div className="px-5 py-4">
              <div className="flex justify-between text-xs mb-1.5">
                <span className="text-zinc-400">{t("percent", { percent: data.progress.percent })}</span>
                <span className={data.progress.allRequiredDone ? "text-green-400" : "text-orange-400"}>
                  {data.progress.allRequiredDone ? t("allReq") : t("req", { done: data.progress.requiredDone, total: data.progress.requiredTotal })}
                </span>
              </div>
              <div className="h-1.5 bg-zinc-900 overflow-hidden">
                <div className="h-full bg-red-600 transition-all duration-300" style={{ width: `${data.progress.percent}%` }} />
              </div>
            </div>

            <div className="px-5 pb-1">
              {required.length > 0 && <div className="font-mono text-[11px] tracking-[0.14em] uppercase text-zinc-500 pt-2 pb-1">{t("groupRequired")}</div>}
              {required.map((i) => <Step key={i.key} i={i} />)}
              {optional.length > 0 && <div className="font-mono text-[11px] tracking-[0.14em] uppercase text-zinc-500 pt-4 pb-1">{t("groupOptional")}</div>}
              {optional.map((i) => <Step key={i.key} i={i} />)}
            </div>

            <div className="p-5 border-t border-zinc-800 flex justify-between items-center gap-3">
              <button onClick={() => void dismiss()} className="text-zinc-500 hover:text-zinc-300 text-sm">{t("skip")}</button>
              <button
                onClick={() => void finish()}
                disabled={!data.progress.allRequiredDone}
                className="px-4 py-2 bg-red-700 hover:bg-red-600 text-white text-xs font-bold tracking-widest uppercase disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
              >
                <Rocket className="w-3.5 h-3.5" /> {t("finish")}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
