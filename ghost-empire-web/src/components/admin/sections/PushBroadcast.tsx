"use client";
// src/components/admin/sections/PushBroadcast.tsx
// Admin "Notifications" section (#537): see how many viewers enabled web push and
// broadcast a custom message to them ("notify my followers about X"). Dormant until
// VAPID keys are set — shows a setup hint instead of the form.
import { useState, useEffect } from "react";
import { Bell, Send, Loader2, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { SectionCard } from "../shared";
import { apiGet, apiPost } from "@/lib/api-client";

type Stats = { configured: boolean; subscribers: number };

export function PushBroadcastManager({ onToast }: { onToast: (k: "ok" | "err", m: string) => void }) {
  const t = useTranslations("admin.push");
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiGet<Stats>("/api/admin/push")
      .then((d) => { if (!cancelled) setStats(d); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  async function send() {
    if (!body.trim()) return;
    setSending(true);
    try {
      const res = await apiPost<{ ok: boolean; sent?: number; reason?: string }>("/api/admin/push", { title, body });
      if (res.ok) { onToast("ok", t("sent", { n: res.sent ?? 0 })); setBody(""); setTitle(""); }
      else onToast("err", t("notConfigured"));
    } catch {
      onToast("err", t("sendError"));
    } finally {
      setSending(false);
    }
  }

  return (
    <SectionCard title={t("title")} icon={Bell}>
      <p className="text-zinc-500 text-xs mb-3">{t("intro")}</p>
      {loading ? (
        <div className="text-xs text-zinc-500 flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin" /> {t("loading")}</div>
      ) : !stats?.configured ? (
        <div className="border border-amber-700/50 bg-amber-950/20 text-amber-200 text-xs rounded-lg p-3 leading-relaxed">{t("setupHint")}</div>
      ) : (
        <>
          <div className="flex items-center gap-2 text-sm text-zinc-300 mb-3 border border-zinc-800 bg-black/30 rounded-lg px-3 py-2">
            <Users className="w-4 h-4 text-zinc-500" /> {t("subscribers", { n: stats.subscribers })}
          </div>
          <div className="space-y-2">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={120}
              placeholder={t("titlePh")}
              className="w-full bg-black/40 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-zinc-600 outline-none"
            />
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={300}
              rows={3}
              placeholder={t("bodyPh")}
              className="w-full bg-black/40 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-zinc-600 outline-none resize-none"
            />
            <button
              onClick={send}
              disabled={sending || !body.trim() || stats.subscribers === 0}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 border border-red-700 text-red-300 hover:text-white hover:border-red-500 disabled:opacity-50 transition-colors"
            >
              {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} {t("send", { n: stats.subscribers })}
            </button>
          </div>
        </>
      )}
    </SectionCard>
  );
}
