"use client";
// src/components/admin/sections/BotSecret.tsx
// Self-serve provisioning of THIS portal's own bot credential (`Tenant.botSecret`). Before this
// card the column could only be written straight into the DB, so a streamer running their own
// bot instance had no way to get off the shared global BOT_SECRET.
//
// The card is built around one rule: the generated secret exists on screen once, and is never
// fetchable again. Status is a boolean + a 4-char tail; the reveal panel is local state that a
// reload throws away. Backed by /api/admin/bot-secret (owner-scoped, step-up 2FA, audit-logged).
import { useCallback, useEffect, useState } from "react";
import { KeyRound, Loader2, Copy, Check, AlertTriangle, ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { SectionCard } from "../shared";
import { apiGet, apiPostStepUp, ApiError } from "@/lib/api-client";

type Status = {
  configured: boolean;
  hint: string | null;
  slug: string;
  name: string;
  /** Is a shared global BOT_SECRET set? Decides whether clearing leaves the bot able to auth. */
  globalFallback: boolean;
};

export function BotSecretCard({ onToast }: { onToast: (k: "ok" | "err", m: string) => void }) {
  const t = useTranslations("admin.botSecret");
  const [status, setStatus] = useState<Status | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  // The one-time reveal. Deliberately NOT persisted anywhere — closing the panel or
  // reloading the page loses it for good, which is the point.
  const [revealed, setRevealed] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setStatus(await apiGet<Status>("/api/admin/bot-secret")); }
    catch { setStatus(null); } // 404 = this admin has no portal of their own to provision
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function rotate() {
    if (status?.configured && !confirm(t("rotateConfirm"))) return;
    setBusy(true);
    try {
      const d = await apiPostStepUp<{ secret: string }>("/api/admin/bot-secret", { action: "rotate" });
      setRevealed(d.secret);
      onToast("ok", t("generatedMsg"));
      await load();
    } catch (e) { onToast("err", e instanceof ApiError ? e.message : t("err")); }
    finally { setBusy(false); }
  }

  async function clear() {
    // Without a global BOT_SECRET to fall back on, clearing locks the bot out entirely —
    // say so before they do it, not after.
    if (!confirm(status?.globalFallback ? t("clearConfirm") : t("clearConfirmNoGlobal"))) return;
    setBusy(true);
    try {
      await apiPostStepUp("/api/admin/bot-secret", { action: "clear" });
      setRevealed(null);
      onToast("ok", t("clearedMsg"));
      await load();
    } catch (e) { onToast("err", e instanceof ApiError ? e.message : t("err")); }
    finally { setBusy(false); }
  }

  function copySecret() {
    if (!revealed) return;
    void navigator.clipboard?.writeText(revealed).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  if (status === undefined) {
    return (
      <SectionCard title={t("title")} icon={KeyRound}>
        <div className="text-xs text-zinc-500 flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin" /> {t("loading")}</div>
      </SectionCard>
    );
  }
  if (status === null) {
    return (
      <SectionCard title={t("title")} icon={KeyRound}>
        <p className="text-zinc-500 text-sm">{t("notOwner")}</p>
      </SectionCard>
    );
  }

  return (
    <SectionCard title={t("title")} icon={KeyRound}>
      <p className="text-zinc-500 text-xs mb-3">{t("intro", { portal: status.name })}</p>

      {revealed ? (
        <div className="space-y-3 mb-4">
          <div className="border border-amber-800/60 bg-amber-950/20 rounded-lg p-3">
            <div className="text-[11px] text-amber-300 font-bold inline-flex items-center gap-1.5 mb-2">
              <AlertTriangle className="w-3.5 h-3.5" /> {t("revealWarn")}
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-sm font-mono text-amber-200 break-all">{revealed}</code>
              <button onClick={copySecret} title={t("copyBtn")} aria-label={t("copyBtn")}
                className="shrink-0 w-8 h-8 inline-flex items-center justify-center border border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-600 rounded">
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
            <div className="text-[10px] text-zinc-500 font-mono break-all mt-2">BOT_SECRET={revealed}</div>
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
          <div className="text-sm text-zinc-400">
            {status.globalFallback ? t("statusOffGlobal") : t("statusOffNone")}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <button onClick={() => void rotate()} disabled={busy}
            className="px-4 py-2 bg-red-700 hover:bg-red-600 text-white text-[10px] font-bold tracking-widest uppercase disabled:opacity-50 inline-flex items-center justify-center gap-2">
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <KeyRound className="w-3.5 h-3.5" />}
            {status.configured ? t("rotateBtn") : t("generateBtn")}
          </button>
          {status.configured && (
            <button onClick={() => void clear()} disabled={busy}
              className="px-4 py-2 rounded-lg text-[10px] font-bold tracking-widest uppercase border border-zinc-700 text-zinc-300 hover:border-zinc-500 disabled:opacity-50">
              {t("clearBtn")}
            </button>
          )}
        </div>

        <p className="text-[10px] text-zinc-600">{t("fallbackNote")}</p>
      </div>
    </SectionCard>
  );
}
