"use client";
// src/components/admin/sections/Recap.tsx
// AI Stream Recap (#516): generate an AI post-stream summary and post it to Discord.
// Data via /api/admin/recap. AI is the elite-plan feature — degrades with a clear note.
import { useState, useEffect, useCallback } from "react";
import { Sparkles, Loader2, Send, RefreshCw, Check } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { SectionCard } from "../shared";
import { apiGet, apiPost, ApiError } from "@/lib/api-client";

export function RecapManager({ onToast }: { onToast: (k: "ok" | "err", m: string) => void }) {
  const t = useTranslations("admin.recap");
  const locale = useLocale();
  const [hasWebhook, setHasWebhook] = useState(false);
  const [webhook, setWebhook] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setHasWebhook((await apiGet<{ hasWebhook: boolean }>("/api/admin/recap")).hasWebhook); } catch { /* keep */ }
  }, []);
  useEffect(() => { void load(); }, [load]);

  function err(e: unknown): string {
    if (e instanceof ApiError) {
      if (e.message === "ai-unavailable") return t("aiUnavailable");
      if (e.message === "ai-failed") return t("aiFailed");
      if (e.message === "no-webhook") return t("noWebhook");
      return e.message;
    }
    return t("err");
  }

  async function saveWebhook() {
    setBusy("webhook");
    try { await apiPost("/api/admin/recap", { action: "save-webhook", url: webhook.trim() }); onToast("ok", t("webhookSaved")); setWebhook(""); await load(); }
    catch (e) { onToast("err", err(e)); }
    setBusy(null);
  }
  async function generate(post: boolean) {
    setBusy(post ? "post" : "gen");
    try {
      const r = await apiPost<{ text: string; posted?: boolean }>("/api/admin/recap", { action: post ? "post" : "generate", locale });
      setText(r.text);
      onToast("ok", post ? (r.posted ? t("posted") : t("postFailed")) : t("generated"));
    } catch (e) {
      // generate/post may still return text (e.g. no-webhook) in the error body.
      const body = e instanceof ApiError ? (e.body as { text?: string } | null) : null;
      if (body?.text) setText(body.text);
      onToast("err", err(e));
    }
    setBusy(null);
  }

  return (
    <SectionCard title={t("title")} icon={Sparkles}>
      <p className="text-zinc-500 text-xs mb-3">{t("intro")}</p>

      {/* Discord webhook */}
      <div className="border border-zinc-800 bg-black/30 p-3 mb-3">
        <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-1.5">{t("webhookTitle")} {hasWebhook && <Check className="inline w-3 h-3 text-emerald-400" />}</div>
        <div className="flex gap-2">
          <input value={webhook} placeholder={hasWebhook ? t("webhookSetPh") : "https://discord.com/api/webhooks/…"} onChange={(e) => setWebhook(e.target.value)} className="flex-1 border border-zinc-700 bg-black/40 px-2 py-1.5 text-xs text-white font-mono outline-hidden focus:border-red-600" />
          <button onClick={() => void saveWebhook()} disabled={busy === "webhook"} className="px-3 py-1.5 border border-zinc-700 text-zinc-200 hover:border-red-600 text-[10px] font-bold tracking-widest uppercase disabled:opacity-50">
            {busy === "webhook" ? <Loader2 className="w-3 h-3 animate-spin" /> : t("save")}
          </button>
        </div>
      </div>

      {/* Generate / post */}
      <div className="flex gap-2 mb-3">
        <button onClick={() => void generate(false)} disabled={busy !== null} className="px-3 py-1.5 bg-red-700 hover:bg-red-600 text-white text-[10px] font-bold tracking-widest uppercase disabled:opacity-50 inline-flex items-center gap-1.5">
          {busy === "gen" ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />} {t("generate")}
        </button>
        <button onClick={() => void generate(true)} disabled={busy !== null || !hasWebhook} title={!hasWebhook ? t("noWebhook") : undefined} className="px-3 py-1.5 border border-zinc-700 text-zinc-200 hover:border-red-600 text-[10px] font-bold tracking-widest uppercase disabled:opacity-40 inline-flex items-center gap-1.5">
          {busy === "post" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />} {t("post")}
        </button>
      </div>

      {text && (
        <div className="border border-zinc-800 bg-black/30 p-3">
          <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-1.5">{t("previewTitle")}</div>
          <p className="text-sm text-zinc-200 whitespace-pre-wrap">{text}</p>
        </div>
      )}
    </SectionCard>
  );
}
