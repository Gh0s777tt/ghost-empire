"use client";
// src/components/admin/sections/TwitchEventSub.tsx — lazily-loaded Twitch EventSub manager.
import { useState } from "react";
import { ShieldCheck, Loader2, Zap, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { SectionCard } from "../shared";
import type { TwitchEventSubData } from "../types";

const EVENT_TYPE_LABEL: Record<string, string> = {
  "channel.subscribe": "Subskrypcje",
  "channel.subscription.gift": "Gifted Suby",
  "channel.cheer": "Cheery (bits)",
};

export function TwitchEventSubManager({
  data, onToast, onSuccess, pending,
}: {
  data: TwitchEventSubData;
  onToast: (k: "ok" | "err", m: string) => void;
  onSuccess: () => void;
  pending: boolean;
}) {
  const [busy, setBusy] = useState(false);

  async function setup() {
    if (!confirm("Utworzyć subskrypcje EventSub (subs/gifts/cheers)?")) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/twitch-eventsub", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "setup" }),
      });
      const result = await res.json();
      if (!res.ok) {
        onToast("err", result.error ?? "Błąd");
      } else {
        const ok = (result.results as Array<{ ok: boolean }>).filter((r) => r.ok).length;
        const fail = (result.results as Array<{ ok: boolean }>).filter((r) => !r.ok).length;
        onToast("ok", `Setup: ok=${ok}, fail=${fail}`);
        onSuccess();
      }
    } finally { setBusy(false); }
  }

  async function deleteSub(id: string, type: string) {
    if (!confirm(`Usunąć subskrypcję ${type}?`)) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/twitch-eventsub", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", id }),
      });
      if (res.ok) { onToast("ok", "Subskrypcja usunięta"); onSuccess(); }
      else onToast("err", "Błąd");
    } finally { setBusy(false); }
  }

  return (
    <SectionCard title="Twitch EventSub (auto subs/gifts/bits)" icon={ShieldCheck}>
      <p className="text-zinc-500 text-xs mb-3">
        Automatyczne nagrody Ghost Tokens dla widzów którzy subują, giftują suby albo cheerują bits na Twitch.
        Wymaga jednorazowej autoryzacji streamera (Gh0s77tt) ze scope&apos;ami: <code className="text-red-400">channel:read:subscriptions</code>, <code className="text-red-400">bits:read</code>.
      </p>

      {/* Streamer auth status */}
      <div className="border border-zinc-800 bg-black/30 p-3 mb-3">
        {data.streamerConnected ? (
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex-1">
              <div className="text-sm font-bold text-green-300 mb-0.5">
                ● Streamer autoryzowany: @{data.broadcasterLogin}
              </div>
              <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">
                Broadcaster ID: {data.broadcasterId} · od {data.connectedAt && new Date(data.connectedAt).toLocaleString("pl-PL", { dateStyle: "short" })}
              </div>
            </div>
            <button
              onClick={setup}
              disabled={busy || pending}
              className="px-3 py-1.5 bg-purple-700 hover:bg-purple-600 text-white text-[10px] font-bold tracking-widest uppercase disabled:opacity-50 flex items-center gap-1.5"
            >
              {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
              {data.subscriptions.length === 0 ? "Utwórz subskrypcje" : "Reset + utwórz"}
            </button>
            <a
              href="/api/admin/twitch-streamer-auth"
              className="px-3 py-1.5 border border-zinc-700 hover:border-zinc-500 text-zinc-300 text-[10px] font-bold tracking-widest uppercase"
            >
              Re-autoryzuj
            </a>
          </div>
        ) : (
          <div className="text-center py-2">
            <p className="text-zinc-400 text-sm mb-3">
              Streamer Twitch jeszcze nie autoryzował. Kliknij i zaloguj jako <strong>Gh0s77tt</strong> żeby nadać Ghost Empire prawo czytania subów i bits.
            </p>
            <a
              href="/api/admin/twitch-streamer-auth"
              className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold tracking-widest uppercase"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              Autoryzuj jako streamer
            </a>
          </div>
        )}
      </div>

      {/* Subscriptions list */}
      {data.streamerConnected && (
        <>
          <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-2">
            Subskrypcje EventSub ({data.subscriptions.length})
          </div>
          {data.subscriptions.length === 0 ? (
            <p className="text-zinc-500 text-sm py-2 text-center">
              Brak subskrypcji. Kliknij &quot;Utwórz subskrypcje&quot; powyżej.
            </p>
          ) : (
            <div className="space-y-1.5 mb-4">
              {data.subscriptions.map((s) => (
                <div key={s.id} className="flex items-center gap-3 border border-zinc-800 bg-black/30 p-2">
                  <span className="text-[10px] font-mono uppercase tracking-widest px-2 py-0.5 border border-zinc-700 text-zinc-300">
                    {EVENT_TYPE_LABEL[s.type] ?? s.type}
                  </span>
                  <span className={cn(
                    "text-[10px] font-mono uppercase tracking-widest px-2 py-0.5",
                    s.status === "enabled" ? "border border-green-700 bg-green-950/30 text-green-300" : "border border-orange-700 bg-orange-950/30 text-orange-300",
                  )}>
                    {s.status}
                  </span>
                  <div className="flex-1 min-w-0 text-[10px] font-mono text-zinc-500">
                    {s.lastSeenAt ? `Last: ${new Date(s.lastSeenAt).toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "short" })}` : "Jeszcze brak eventów"}
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
                Ostatnie eventy ({data.recentEvents.length})
              </div>
              <div className="space-y-1 text-[10px] font-mono">
                {data.recentEvents.map((e) => (
                  <div key={e.id} className="flex items-center gap-2 border-l-2 border-zinc-800 pl-2 py-1">
                    <span className="text-zinc-500 uppercase tracking-widest w-24 truncate">
                      {EVENT_TYPE_LABEL[e.type] ?? e.type}
                    </span>
                    {e.tokensGranted ? (
                      <span className="text-green-400">+{e.tokensGranted.toLocaleString("pl-PL")} GT</span>
                    ) : (
                      <span className="text-zinc-600">(unmatched)</span>
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
