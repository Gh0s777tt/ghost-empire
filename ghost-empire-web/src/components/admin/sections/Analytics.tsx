"use client";
// src/components/admin/sections/Analytics.tsx
// Lazily-loaded admin analytics: stream sessions ("czas na streamie") + chat heatmap.
// Extracted from the AdminClient monolith; rendered via next/dynamic.
import { useState, useEffect } from "react";
import { Radio, Loader2, TrendingUp } from "lucide-react";
import { cn, formatDate } from "@/lib/utils";
import { SectionCard } from "../shared";

type StreamSessionRow = { id: string; startedAt: string; endedAt: string | null; durationSeconds: number | null };

function fmtBroadcastDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

// "Czas na streamie" — broadcast sessions from Twitch EventSub stream.online/offline.
// Measures the STREAMER's broadcast time (not per-viewer — EventSub can't do that).
function StreamSessionsCard() {
  const [loading, setLoading] = useState(true);
  const [streams, setStreams] = useState<{
    live: { startedAt: string } | null;
    totalSeconds: number;
    count: number;
    recent: StreamSessionRow[];
  } | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/analytics");
        const d = await res.json();
        if (!cancelled && res.ok) setStreams(d.streams ?? null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Tick once a second only while live, to advance the uptime counter.
  useEffect(() => {
    if (!streams?.live) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [streams?.live]);

  const liveUptime = streams?.live
    ? Math.max(0, Math.floor((now - new Date(streams.live.startedAt).getTime()) / 1000))
    : 0;

  return (
    <SectionCard title="Czas na streamie" icon={Radio}>
      <p className="text-zinc-500 text-xs mb-3">
        Sesje nadawania z Twitch EventSub (<code>stream.online</code>/<code>stream.offline</code>). Mierzy czas <strong>nadawania streamera</strong>, nie czas oglądania per-widz.
      </p>
      {loading ? (
        <div className="text-xs text-zinc-500 flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin" /> Ładowanie…</div>
      ) : !streams || (streams.count === 0 && !streams.live) ? (
        <div className="text-xs text-zinc-500 text-center py-4 border border-zinc-900 bg-black/20">
          Brak sesji — pojawią się po pierwszym streamie. Wymaga utworzenia subskrypcji <strong>stream.online/offline</strong> w sekcji <span className="font-mono">Twitch</span> (przycisk „Utwórz subskrypcje").
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-4">
            <div className={cn(
              "border p-3",
              streams.live ? "border-green-700/60 bg-green-950/20" : "border-zinc-800 bg-black/30",
            )}>
              <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-1">Status</div>
              {streams.live ? (
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  <span className="text-sm font-bold text-green-300 tabular-nums">LIVE · {fmtBroadcastDuration(liveUptime)}</span>
                </div>
              ) : (
                <div className="text-sm font-bold text-zinc-400">Offline</div>
              )}
            </div>
            <div className="border border-zinc-800 bg-black/30 p-3">
              <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-1">Łączny czas nadawania</div>
              <div className="text-sm font-bold text-white">{fmtBroadcastDuration(streams.totalSeconds)}</div>
            </div>
            <div className="border border-zinc-800 bg-black/30 p-3">
              <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-1">Liczba streamów</div>
              <div className="text-sm font-bold text-white">{streams.count}</div>
            </div>
          </div>

          <div className="space-y-1.5">
            {streams.recent.map((s) => (
              <div key={s.id} className="flex items-center gap-3 border border-zinc-800 bg-black/30 px-3 py-2">
                <Radio className={cn("w-3.5 h-3.5 shrink-0", s.endedAt === null ? "text-green-500" : "text-zinc-600")} />
                <div className="flex-1 min-w-0 text-sm text-white truncate">{formatDate(s.startedAt)}</div>
                <div className="text-[11px] font-mono text-zinc-400 shrink-0">
                  {s.endedAt === null
                    ? <span className="text-green-400">trwa…</span>
                    : (s.durationSeconds != null ? fmtBroadcastDuration(s.durationSeconds) : "—")}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </SectionCard>
  );
}

function ChatHeatmap() {
  const [loading, setLoading] = useState(true);
  const [grid, setGrid] = useState<number[][]>([]);
  const [peak, setPeak] = useState(0);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/analytics");
        const d = await res.json();
        if (!cancelled && res.ok) {
          setGrid(d.grid ?? []);
          setPeak(d.peak ?? 0);
          setTotal(d.total ?? 0);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const days = ["Nd", "Pn", "Wt", "Śr", "Cz", "Pt", "So"];
  const cellColor = (v: number) =>
    v <= 0 || peak <= 0 ? "rgba(255,255,255,0.04)" : `rgba(229,9,20,${(0.15 + (v / peak) * 0.85).toFixed(3)})`;

  return (
    <SectionCard title="Analityka — heatmapa czatu" icon={TrendingUp}>
      <p className="text-zinc-500 text-xs mb-3">
        Kiedy czat jest najbardziej aktywny (dzień tygodnia × godzina, czas Europe/Warsaw). Zliczane z aktywności na Twitch + Kick + YouTube (1/min/widz).
      </p>
      {loading ? (
        <div className="text-xs text-zinc-500 flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin" /> Ładowanie…</div>
      ) : total === 0 ? (
        <div className="text-xs text-zinc-500 text-center py-4 border border-zinc-900 bg-black/20">
          Brak danych — pojawią się, gdy ktoś napisze na czacie podczas streamu.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <div className="inline-block">
            <div className="flex items-center gap-[2px] mb-[2px] ml-7">
              {Array.from({ length: 24 }, (_, h) => (
                <div key={h} className="w-[14px] text-center text-[8px] text-zinc-600 tabular-nums">{h % 6 === 0 ? h : ""}</div>
              ))}
            </div>
            {grid.map((row, d) => (
              <div key={d} className="flex items-center gap-[2px] mb-[2px]">
                <div className="w-6 text-[9px] font-mono text-zinc-500 shrink-0">{days[d]}</div>
                {row.map((v, h) => (
                  <div key={h} title={`${days[d]} ${h}:00 — ${v}`} className="w-[14px] h-[14px] rounded-[2px]" style={{ background: cellColor(v) }} />
                ))}
              </div>
            ))}
          </div>
          <div className="text-[10px] text-zinc-600 mt-2">
            Łącznie {total.toLocaleString("pl-PL")} aktywnych chatter-minut · szczyt {peak}/slot
          </div>
        </div>
      )}
    </SectionCard>
  );
}

export function AnalyticsSection() {
  return (
    <div className="space-y-6">
      <StreamSessionsCard />
      <ChatHeatmap />
    </div>
  );
}
