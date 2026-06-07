"use client";
// src/components/admin/sections/KickEvents.tsx — lazily-loaded Kick webhook events manager.
import { useState, useEffect, useCallback } from "react";
import { Radio, Loader2, Zap, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { SectionCard } from "../shared";

type KickData = {
  streamerConnected: boolean;
  broadcasterLogin: string | null;
  broadcasterId: string | null;
  connectedAt: string | null;
  subscriptions: Array<{
    id: string;
    type: string;
    lastSeenAt: string | null;
    createdAt: string;
  }>;
  remote: Array<{ id: string; event: string; version: number; method: string; created_at: string; updated_at: string }>;
  recentEvents: Array<{
    id: string;
    type: string;
    userId: string | null;
    tokensGranted: number | null;
    receivedAt: string;
  }>;
};

export function KickEventsManager({
  onToast, onSuccess, pending,
}: {
  onToast: (k: "ok" | "err", m: string) => void;
  onSuccess: () => void;
  pending: boolean;
}) {
  const t = useTranslations("admin.kickEvents");
  const KICK_EVENT_LABEL = t.raw("eventLabel") as Record<string, string>;
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<KickData | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/kick-events");
      const json = await res.json();
      if (res.ok) setData(json);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function setup() {
    if (!confirm(t("setupConfirm"))) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/kick-events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "setup" }),
      });
      const result = await res.json();
      // Always log the full response so we can see exactly what Kick said
      console.log("[kick setup] response:", result);
      if (!res.ok || result.error) {
        // Error case (incl. HTTP 200 but Kick rejected / created nothing)
        onToast("err", result.error ?? t("setupErr"));
      } else if (Array.isArray(result.results) && result.results.length > 0) {
        const ok = result.results.filter((r: { ok: boolean }) => r.ok).length;
        const fail = result.results.length - ok;
        onToast(fail > 0 ? "err" : "ok", `Setup: ok=${ok}, fail=${fail}`);
      } else {
        onToast("ok", result.message ?? t("setupDone"));
      }
      await load();
      onSuccess();
    } finally {
      setBusy(false);
    }
  }

  async function deleteSub(id: string, type: string) {
    if (!confirm(t("deleteConfirm", { type }))) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/kick-events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", id }),
      });
      if (res.ok) { onToast("ok", t("deleted")); await load(); }
      else { const r = await res.json(); onToast("err", r.error ?? t("err")); }
    } finally {
      setBusy(false);
    }
  }

  return (
    <SectionCard title="Kick — webhook events (subs/gifts/follows)" icon={Radio}>
      <p className="text-zinc-500 text-xs mb-3">
        {t.rich("intro", { code: (c) => <code className="text-green-400">{c}</code> })}
      </p>

      {/* Streamer auth status */}
      <div className="border border-zinc-800 bg-black/30 p-3 mb-3">
        {loading ? (
          <div className="text-xs text-zinc-500 flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin" /> {t("loading")}</div>
        ) : data?.streamerConnected ? (
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold text-green-300 mb-0.5">
                ● {t("streamerAuthorized")}: @{data.broadcasterLogin}
              </div>
              <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest truncate">
                Broadcaster ID: {data.broadcasterId} · {t("since")} {data.connectedAt && new Date(data.connectedAt).toLocaleString("pl-PL", { dateStyle: "short" })}
              </div>
            </div>
            <button
              onClick={setup}
              disabled={busy || pending}
              className="px-3 py-1.5 bg-green-700 hover:bg-green-600 text-white text-[10px] font-bold tracking-widest uppercase disabled:opacity-50 flex items-center gap-1.5"
            >
              {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
              {data.subscriptions.length === 0 ? t("createSubs") : t("addMissing")}
            </button>
            <a
              href="/api/admin/kick-streamer-auth"
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
              href="/api/admin/kick-streamer-auth"
              className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-500 text-white text-xs font-bold tracking-widest uppercase"
            >
              <Radio className="w-3.5 h-3.5" />
              {t("authKick")}
            </a>
          </div>
        )}
      </div>

      {/* Subscriptions list */}
      {data?.streamerConnected && (
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
                    {KICK_EVENT_LABEL[s.type] ?? s.type}
                  </span>
                  <div className="flex-1 min-w-0 text-[10px] font-mono text-zinc-500 truncate">
                    {s.lastSeenAt ? `Last: ${new Date(s.lastSeenAt).toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "short" })}` : t("noEvents")}
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
                    <span className="text-zinc-500 uppercase tracking-widest w-32 truncate">
                      {KICK_EVENT_LABEL[e.type] ?? e.type}
                    </span>
                    {e.tokensGranted ? (
                      <span className="text-green-400">+{e.tokensGranted.toLocaleString("pl-PL")} GT</span>
                    ) : (
                      <span className="text-zinc-600">(unmatched / no reward)</span>
                    )}
                    <span className="text-zinc-700 ml-auto">
                      {new Date(e.receivedAt).toLocaleTimeString("pl-PL")}
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
