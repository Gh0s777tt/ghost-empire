"use client";
// src/components/admin/sections/TwitchEventSub.tsx — lazily-loaded Twitch EventSub manager.
import { useState } from "react";
import { ShieldCheck, Loader2, Zap, Trash2 } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { cn } from "@/lib/utils";
import { useTenantBranding } from "@/components/TenantBranding";
import { SectionCard } from "../shared";
import { apiPost, ApiError } from "@/lib/api-client";
import type { TwitchEventSubData } from "../types";

export function TwitchEventSubManager({
  data, onToast, onSuccess, pending,
}: {
  data: TwitchEventSubData;
  onToast: (k: "ok" | "err", m: string) => void;
  onSuccess: () => void;
  pending: boolean;
}) {
  const t = useTranslations("admin.twitchEventSub");
  const nf = useLocale();
  const { tokenSymbol } = useTenantBranding();
  const EVENT_TYPE_LABEL = t.raw("eventType") as Record<string, string>;
  // Raw EventSub types are dotted (e.g. "channel.subscribe"); message keys use
  // underscores because next-intl treats dots as nesting separators.
  const eventLabel = (type: string) => EVENT_TYPE_LABEL[type.replace(/\./g, "_")] ?? type;
  const [busy, setBusy] = useState(false);

  async function setup() {
    if (!confirm(t("setupConfirm"))) return;
    setBusy(true);
    try {
      const result = await apiPost<{ results: Array<{ ok: boolean }> }>("/api/admin/twitch-eventsub", { action: "setup" });
      const ok = result.results.filter((r) => r.ok).length;
      const fail = result.results.filter((r) => !r.ok).length;
      onToast("ok", `Setup: ok=${ok}, fail=${fail}`);
      onSuccess();
    } catch (err) {
      onToast("err", err instanceof ApiError ? (err.message || t("err")) : t("err"));
    } finally { setBusy(false); }
  }

  async function deleteSub(id: string, type: string) {
    if (!confirm(t("deleteConfirm", { type }))) return;
    setBusy(true);
    try {
      await apiPost("/api/admin/twitch-eventsub", { action: "delete", id });
      onToast("ok", t("deleted")); onSuccess();
    } catch {
      onToast("err", t("err"));
    } finally { setBusy(false); }
  }

  return (
    <SectionCard title="Twitch EventSub (auto subs/gifts/bits)" icon={ShieldCheck}>
      <p className="text-zinc-500 text-xs mb-3">
        {t.rich("intro", { code: (c) => <code className="text-red-400">{c}</code> })}
      </p>

      {/* Streamer auth status */}
      <div className="border border-zinc-800 bg-black/30 p-3 mb-3">
        {data.streamerConnected ? (
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex-1">
              <div className="text-sm font-bold text-green-300 mb-0.5">
                ● {t("streamerAuthorized")}: @{data.broadcasterLogin}
              </div>
              <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">
                Broadcaster ID: {data.broadcasterId} · {t("since")} {data.connectedAt && new Date(data.connectedAt).toLocaleString(nf, { dateStyle: "short" })}
              </div>
            </div>
            <button
              onClick={setup}
              disabled={busy || pending}
              className="px-3 py-1.5 bg-purple-700 hover:bg-purple-600 text-white text-[10px] font-bold tracking-widest uppercase disabled:opacity-50 flex items-center gap-1.5"
            >
              {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
              {data.subscriptions.length === 0 ? t("createSubs") : t("resetCreate")}
            </button>
            <a
              href="/api/admin/twitch-streamer-auth"
              className="px-3 py-1.5 border border-zinc-700 hover:border-zinc-500 text-zinc-300 text-[10px] font-bold tracking-widest uppercase"
            >
              {t("reauth")}
            </a>
          </div>
        ) : (
          <div className="text-center py-2">
            <p className="text-zinc-400 text-sm mb-3">
              {t.rich("notConnected", { b: (c) => <strong>{c}</strong> })}
            </p>
            <a
              href="/api/admin/twitch-streamer-auth"
              className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold tracking-widest uppercase"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              {t("authAsStreamer")}
            </a>
          </div>
        )}
      </div>

      {/* Subscriptions list */}
      {data.streamerConnected && (
        <>
          <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-2">
            {t("subsTitle", { count: data.subscriptions.length })}
          </div>
          {data.subscriptions.length === 0 ? (
            <p className="text-zinc-500 text-sm py-2 text-center">
              {t("empty")}
            </p>
          ) : (
            <div className="space-y-1.5 mb-4">
              {data.subscriptions.map((s) => (
                <div key={s.id} className="flex items-center gap-3 border border-zinc-800 bg-black/30 p-2">
                  <span className="text-[10px] font-mono uppercase tracking-widest px-2 py-0.5 border border-zinc-700 text-zinc-300">
                    {eventLabel(s.type)}
                  </span>
                  <span className={cn(
                    "text-[10px] font-mono uppercase tracking-widest px-2 py-0.5",
                    s.status === "enabled" ? "border border-green-700 bg-green-950/30 text-green-300" : "border border-orange-700 bg-orange-950/30 text-orange-300",
                  )}>
                    {s.status}
                  </span>
                  <div className="flex-1 min-w-0 text-[10px] font-mono text-zinc-500">
                    {s.lastSeenAt ? `Last: ${new Date(s.lastSeenAt).toLocaleString(nf, { dateStyle: "short", timeStyle: "short" })}` : t("noEvents")}
                  </div>
                  <button
                    onClick={() => deleteSub(s.id, s.type)}
                    disabled={busy || pending}
                    className="text-zinc-500 hover:text-red-400"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Recent events log */}
          {data.recentEvents.length > 0 && (
            <>
              <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-2">
                {t("recentTitle", { count: data.recentEvents.length })}
              </div>
              <div className="space-y-1 text-[10px] font-mono">
                {data.recentEvents.map((e) => (
                  <div key={e.id} className="flex items-center gap-2 border-l-2 border-zinc-800 pl-2 py-1">
                    <span className="text-zinc-500 uppercase tracking-widest w-24 truncate">
                      {eventLabel(e.type)}
                    </span>
                    {e.tokensGranted ? (
                      <span className="text-green-400">+{e.tokensGranted.toLocaleString(nf)} {tokenSymbol}</span>
                    ) : (
                      <span className="text-zinc-600">(unmatched)</span>
                    )}
                    <span className="text-zinc-700 ml-auto">
                      {new Date(e.receivedAt).toLocaleTimeString(nf)}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </SectionCard>
  );
}
