"use client";
// src/components/admin/sections/YouTubeLive.tsx — lazily-loaded YouTube live chat manager.
import { useState, useEffect, useCallback } from "react";
import { MonitorPlay, Loader2, Radio } from "lucide-react";
import { SectionCard } from "../shared";

type YTStatus = {
  ok: boolean;
  streamerConnected: boolean;
  channelTitle: string | null;
  currentLiveVideoId: string | null;
  lastPolledAt: string | null;
};

type YTPollResult = {
  ok: boolean;
  status?: string;
  rediscovered?: boolean;
  videoId?: string;
  messagesFetched?: number;
  superChatsProcessed?: number;
  memberEventsProcessed?: number;
  messagesLogged?: number;
  nextPollSuggestedMs?: number;
  error?: string;
};

export function YouTubeLiveManager({
  onToast, onSuccess, pending,
}: {
  onToast: (k: "ok" | "err", m: string) => void;
  onSuccess: () => void;
  pending: boolean;
}) {
  const [status, setStatus] = useState<YTStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [polling, setPolling] = useState(false);
  const [lastResult, setLastResult] = useState<YTPollResult | null>(null);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/yt/poll-live-chat", { method: "GET" });
      const data = await res.json();
      setStatus(data);
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadStatus(); }, [loadStatus]);

  async function pollNow() {
    setPolling(true);
    setLastResult(null);
    try {
      const res = await fetch("/api/yt/poll-live-chat", { method: "POST" });
      const data: YTPollResult = await res.json();
      setLastResult(data);
      if (!res.ok) {
        onToast("err", data.error ?? "Polling failed");
      } else {
        if (data.status === "no_active_broadcast") {
          onToast("ok", "Nie ma aktywnej transmisji live");
        } else if (data.status === "chat_ended") {
          onToast("ok", "Stream skończył się — cache wyczyszczony");
        } else {
          onToast("ok", `Pobrane: ${data.messagesFetched ?? 0} wiadomości, ${data.superChatsProcessed ?? 0} super chat`);
        }
        await loadStatus();
        onSuccess();
      }
    } finally {
      setPolling(false);
    }
  }

  return (
    <SectionCard title="YouTube Live Chat (Super Chats + Members)" icon={MonitorPlay}>
      <p className="text-zinc-500 text-xs mb-3">
        Wykrywa Super Chats i nowych członków na YouTube live → grant Ghost Tokens
        donatorowi, zapisuje donejt, triggeruje stream alert na OBS overlay.
      </p>

      {/* Connection status */}
      <div className="border border-zinc-800 bg-black/30 p-3 mb-3">
        {loading ? (
          <div className="text-xs text-zinc-500 flex items-center gap-2">
            <Loader2 className="w-3 h-3 animate-spin" /> Ładowanie…
          </div>
        ) : status?.streamerConnected ? (
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold text-green-300 mb-0.5 flex items-center gap-1.5">
                <Radio className="w-3.5 h-3.5" />
                Streamer autoryzowany: {status.channelTitle}
              </div>
              <div className="text-[10px] font-mono text-zinc-500">
                {status.currentLiveVideoId ? (
                  <>Live video: <code className="text-zinc-300">{status.currentLiveVideoId}</code></>
                ) : (
                  "Brak cache live video — następny poll wyszuka"
                )}
                {status.lastPolledAt && (
                  <> · Ostatni poll: {new Date(status.lastPolledAt).toLocaleTimeString("pl-PL")}</>
                )}
              </div>
            </div>
            <a
              href="/api/admin/youtube-streamer-auth"
              className="px-3 py-1.5 border border-zinc-700 hover:border-zinc-500 text-zinc-300 text-[10px] font-bold tracking-widest uppercase"
            >
              Re-autoryzuj
            </a>
          </div>
        ) : (
          <div className="text-center py-2">
            <p className="text-zinc-400 text-sm mb-3">
              YouTube nie autoryzowany. Zaloguj się jako <strong>właściciel kanału Gh0s77tt</strong> żeby nadać Ghost Empire dostęp read-only do live chatu.
            </p>
            <a
              href="/api/admin/youtube-streamer-auth"
              className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-xs font-bold tracking-widest uppercase"
            >
              <MonitorPlay className="w-3.5 h-3.5" />
              Autoryzuj YouTube
            </a>
          </div>
        )}
      </div>

      {/* Manual poll + result */}
      {status?.streamerConnected && (
        <>
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <button
              onClick={pollNow}
              disabled={polling || pending}
              className="px-3 py-1.5 bg-red-700 hover:bg-red-600 text-white text-[10px] font-bold tracking-widest uppercase disabled:opacity-50 flex items-center gap-1.5"
            >
              {polling ? <Loader2 className="w-3 h-3 animate-spin" /> : <Radio className="w-3 h-3" />}
              Poll now
            </button>
            <button
              onClick={loadStatus}
              disabled={loading || pending}
              className="px-3 py-1.5 border border-zinc-700 hover:border-zinc-500 text-zinc-300 text-[10px] font-bold tracking-widest uppercase disabled:opacity-50"
            >
              Odśwież status
            </button>
            <span className="text-[10px] text-zinc-500">
              Manual poll dla testu. Dla auto-pollingu setuj external cron (poniżej).
            </span>
          </div>

          {lastResult && (
            <div className="border border-zinc-800 bg-black/30 p-3 mb-3 text-[10px] font-mono">
              <div className="text-zinc-500 uppercase tracking-widest mb-1">Ostatni poll result</div>
              <pre className="text-zinc-300 whitespace-pre-wrap break-all">
                {JSON.stringify(lastResult, null, 2)}
              </pre>
            </div>
          )}

          {/* External cron setup instructions */}
          <div className="border border-zinc-800 bg-black/30 p-3 text-xs space-y-2">
            <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">
              Setup auto-polling (zalecane)
            </div>
            <p className="text-zinc-400">
              Vercel Hobby plan obsługuje tylko daily cron — dla pollingu co minutę użyj zewnętrznego serwisu:
            </p>
            <ol className="text-zinc-400 list-decimal pl-5 space-y-1">
              <li>
                Wejdź na <a href="https://cron-job.org" target="_blank" rel="noreferrer" className="text-red-400 underline">cron-job.org</a> (free)
              </li>
              <li>
                Stwórz nowy job z URL: <code className="text-zinc-200 text-[10px]">{typeof window !== "undefined" ? window.location.origin : ""}/api/yt/poll-live-chat</code>
              </li>
              <li>
                Method: <strong>POST</strong>, schedule: <strong>co 30s</strong> (lub 1 min jeśli oszczędzasz quota)
              </li>
              <li>
                Add header: <code className="text-zinc-200">Authorization: Bearer &lt;BOT_SECRET&gt;</code> (ten sam co Discord bot używa)
              </li>
              <li>
                Save → status zaczyna się polować automatycznie
              </li>
            </ol>
            <p className="text-zinc-500 text-[10px] italic">
              YouTube Data API quota: 10,000 jednostek/dzień. Polling co 30s przez 3h streama ≈ 1800 jednostek (sporo headroomu). Polluj tylko podczas live żeby oszczędzać quota.
            </p>
          </div>
        </>
      )}
    </SectionCard>
  );
}
