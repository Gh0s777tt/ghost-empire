"use client";
// src/components/admin/sections/StreamDeckToken.tsx
// Self-serve provisioning of THIS portal's Stream Deck / Companion trigger token
// (`Tenant.streamDeckToken`). Sibling of BotSecret.tsx and built on the same one rule: the
// generated token exists on screen ONCE and is never fetchable again — status is a boolean + a
// 4-char tail, and the reveal is local state a reload throws away. Backed by
// /api/admin/streamdeck-token (owner-scoped, audit-logged). Unlike the bot secret this token has
// NO global fallback and NO 2FA step-up — its only power is firing overlay alerts, so a plain
// admin session mints it and clearing it simply disables Stream Deck triggers for the portal.
import { useCallback, useEffect, useState } from "react";
import { SlidersHorizontal, Loader2, Copy, Check, AlertTriangle, ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { SectionCard } from "../shared";
import { apiGet, apiPost, ApiError } from "@/lib/api-client";

type Status = {
  configured: boolean;
  hint: string | null;
  slug: string;
  name: string;
};

export function StreamDeckTokenCard({ onToast }: { onToast: (k: "ok" | "err", m: string) => void }) {
  const t = useTranslations("admin.streamDeckToken");
  const [status, setStatus] = useState<Status | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  // The one-time reveal — deliberately NOT persisted anywhere; closing/reloading loses it for good.
  const [revealed, setRevealed] = useState<string | null>(null);
  // The portal's own origin, so the pasteable URL matches the host the admin is standing on.
  const triggerUrl = typeof window !== "undefined" ? `${window.location.origin}/api/streamdeck/trigger` : "/api/streamdeck/trigger";

  const load = useCallback(async () => {
    try { setStatus(await apiGet<Status>("/api/admin/streamdeck-token")); }
    catch { setStatus(null); } // 404 = this admin has no portal of their own to provision
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function rotate() {
    if (status?.configured && !confirm(t("rotateConfirm"))) return;
    setBusy(true);
    try {
      const d = await apiPost<{ token: string }>("/api/admin/streamdeck-token", { action: "rotate" });
      setRevealed(d.token);
      onToast("ok", t("generatedMsg"));
      await load();
    } catch (e) { onToast("err", e instanceof ApiError ? e.message : t("err")); }
    finally { setBusy(false); }
  }

  async function clear() {
    if (!confirm(t("clearConfirm"))) return;
    setBusy(true);
    try {
      await apiPost("/api/admin/streamdeck-token", { action: "clear" });
      setRevealed(null);
      onToast("ok", t("clearedMsg"));
      await load();
    } catch (e) { onToast("err", e instanceof ApiError ? e.message : t("err")); }
    finally { setBusy(false); }
  }

  function copyToken() {
    if (!revealed) return;
    void navigator.clipboard?.writeText(revealed).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  if (status === undefined) {
    return (
      <SectionCard title={t("title")} icon={SlidersHorizontal}>
        <div className="text-xs text-zinc-500 flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin" /> {t("loading")}</div>
      </SectionCard>
    );
  }
  if (status === null) {
    return (
      <SectionCard title={t("title")} icon={SlidersHorizontal}>
        <p className="text-zinc-500 text-sm">{t("notOwner")}</p>
      </SectionCard>
    );
  }

  return (
    <SectionCard title={t("title")} icon={SlidersHorizontal}>
      <p className="text-zinc-500 text-xs mb-3">{t("intro", { portal: status.name })}</p>

      {revealed ? (
        <div className="space-y-3 mb-4">
          <div className="border border-amber-800/60 bg-amber-950/20 rounded-lg p-3">
            <div className="text-[11px] text-amber-300 font-bold inline-flex items-center gap-1.5 mb-2">
              <AlertTriangle className="w-3.5 h-3.5" /> {t("revealWarn")}
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-sm font-mono text-amber-200 break-all">{revealed}</code>
              <button onClick={copyToken} title={t("copyBtn")} aria-label={t("copyBtn")}
                className="shrink-0 w-8 h-8 inline-flex items-center justify-center border border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-600 rounded">
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
            {/* Everything the admin pastes into Bitfocus Companion / BarRaider, in one place. */}
            <div className="text-[10px] text-zinc-500 font-mono break-all mt-2">POST {triggerUrl}</div>
            <div className="text-[10px] text-zinc-500 font-mono break-all">Authorization: Bearer {revealed}</div>
            <p className="text-[10px] text-zinc-500 mt-2">{t("revealHint")}</p>
          </div>
          <button onClick={() => setRevealed(null)}
            className="px-3 py-1.5 rounded-lg text-[10px] font-bold tracking-widest uppercase border border-zinc-700 text-zinc-300 hover:border-zinc-500">
            {t("doneBtn")}
          </button>
        </div>
      ) : null}

      <div className="space-y-3">
        {status.configured ? (
          <div className="inline-flex items-center gap-2 text-sm font-bold text-emerald-300 border border-emerald-800/60 bg-emerald-950/30 px-3 py-1.5 rounded-lg">
            <ShieldCheck className="w-4 h-4" /> {t("statusOn")}
            <code className="font-mono text-emerald-200/80 text-xs">{status.hint}</code>
          </div>
        ) : (
          <div className="text-sm text-zinc-400">{t("statusOff")}</div>
        )}

        <div className="flex flex-wrap gap-2">
          <button onClick={() => void rotate()} disabled={busy}
            className="px-4 py-2 bg-red-700 hover:bg-red-600 text-white text-[10px] font-bold tracking-widest uppercase disabled:opacity-50 inline-flex items-center justify-center gap-2">
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <SlidersHorizontal className="w-3.5 h-3.5" />}
            {status.configured ? t("rotateBtn") : t("generateBtn")}
          </button>
          {status.configured && (
            <button onClick={() => void clear()} disabled={busy}
              className="px-4 py-2 rounded-lg text-[10px] font-bold tracking-widest uppercase border border-zinc-700 text-zinc-300 hover:border-zinc-500 disabled:opacity-50">
              {t("clearBtn")}
            </button>
          )}
        </div>

        <p className="text-[10px] text-zinc-600">{t("usageNote")}</p>
      </div>
    </SectionCard>
  );
}
