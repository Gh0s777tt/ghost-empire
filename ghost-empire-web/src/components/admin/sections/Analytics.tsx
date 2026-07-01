"use client";
// src/components/admin/sections/Analytics.tsx
// Lazily-loaded admin analytics: stream sessions ("czas na streamie") + chat heatmap.
// Extracted from the AdminClient monolith; rendered via next/dynamic.
import { useState, useEffect } from "react";
import { Radio, Loader2, TrendingUp, LineChart } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { cn, formatDate } from "@/lib/utils";
import { SectionCard } from "../shared";
import { apiGet } from "@/lib/api-client";
import { linePath, areaPath, type CohortRow } from "@/lib/analytics-series";

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
  const t = useTranslations("admin.analytics");
  const locale = useLocale();
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
        const d = await apiGet<{ streams?: { live: { startedAt: string } | null; totalSeconds: number; count: number; recent: StreamSessionRow[] } | null }>("/api/admin/analytics");
        if (!cancelled) setStreams(d.streams ?? null);
      } catch { /* leave empty */ } finally {
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
    <SectionCard title={t("streamTimeTitle")} icon={Radio}>
      <p className="text-zinc-500 text-xs mb-3">
        {t.rich("streamIntro", { code: (c) => <code>{c}</code>, b: (c) => <strong>{c}</strong> })}
      </p>
      {loading ? (
        <div className="text-xs text-zinc-500 flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin" /> {t("loading")}</div>
      ) : !streams || (streams.count === 0 && !streams.live) ? (
        <div className="text-xs text-zinc-500 text-center py-4 border border-zinc-900 bg-black/20">
          {t.rich("streamEmpty", { b: (c) => <strong>{c}</strong>, mono: (c) => <span className="font-mono">{c}</span> })}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-4">
            <div className={cn(
              "border p-3",
              streams.live ? "border-green-700/60 bg-green-950/20" : "border-zinc-800 bg-black/30",
            )}>
              <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-1">{t("statusLabel")}</div>
              {streams.live ? (
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  <span className="text-sm font-bold text-green-300 tabular-nums">LIVE · {fmtBroadcastDuration(liveUptime)}</span>
                </div>
              ) : (
                <div className="text-sm font-bold text-zinc-400">{t("offline")}</div>
              )}
            </div>
            <div className="border border-zinc-800 bg-black/30 p-3">
              <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-1">{t("totalBroadcast")}</div>
              <div className="text-sm font-bold text-white">{fmtBroadcastDuration(streams.totalSeconds)}</div>
            </div>
            <div className="border border-zinc-800 bg-black/30 p-3">
              <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-1">{t("streamCount")}</div>
              <div className="text-sm font-bold text-white">{streams.count}</div>
            </div>
          </div>

          <div className="space-y-1.5">
            {streams.recent.map((s) => (
              <div key={s.id} className="flex items-center gap-3 border border-zinc-800 bg-black/30 px-3 py-2">
                <Radio className={cn("w-3.5 h-3.5 shrink-0", s.endedAt === null ? "text-green-500" : "text-zinc-600")} />
                <div className="flex-1 min-w-0 text-sm text-white truncate">{formatDate(s.startedAt, locale)}</div>
                <div className="text-[11px] font-mono text-zinc-400 shrink-0">
                  {s.endedAt === null
                    ? <span className="text-green-400">{t("ongoing")}</span>
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
  const t = useTranslations("admin.analytics");
  const nf = useLocale();
  const [loading, setLoading] = useState(true);
  const [grid, setGrid] = useState<number[][]>([]);
  const [peak, setPeak] = useState(0);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const d = await apiGet<{ grid?: number[][]; peak?: number; total?: number }>("/api/admin/analytics");
        if (!cancelled) {
          setGrid(d.grid ?? []);
          setPeak(d.peak ?? 0);
          setTotal(d.total ?? 0);
        }
      } catch { /* leave empty */ } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const days = t.raw("daysShort") as string[];
  const cellColor = (v: number) =>
    v <= 0 || peak <= 0 ? "rgba(255,255,255,0.04)" : `rgba(229,9,20,${(0.15 + (v / peak) * 0.85).toFixed(3)})`;

  return (
    <SectionCard title={t("heatmapTitle")} icon={TrendingUp}>
      <p className="text-zinc-500 text-xs mb-3">
        {t("heatmapIntro")}
      </p>
      {loading ? (
        <div className="text-xs text-zinc-500 flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin" /> {t("loading")}</div>
      ) : total === 0 ? (
        <div className="text-xs text-zinc-500 text-center py-4 border border-zinc-900 bg-black/20">
          {t("heatmapEmpty")}
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
            {t("heatmapFooter", { total: total.toLocaleString(nf), peak })}
          </div>
        </div>
      )}
    </SectionCard>
  );
}

// Growth charts (#769): 30-day new users + GT flow, and 8-week signup-cohort retention.
// Hand-rolled animated SVG (no chart lib) — keyframes live in globals.css (CSP #735).
type ChartsData = {
  days: string[];
  newUsers: number[];
  earned: number[];
  spent: number[];
  weeks: string[];
  cohorts: CohortRow[];
};

function GrowthCharts() {
  const t = useTranslations("admin.analytics");
  const nf = useLocale();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ChartsData | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const d = await apiGet<ChartsData>("/api/admin/analytics-charts");
        if (!cancelled) setData(d);
      } catch { /* leave empty */ } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const W = 300, H = 72;
  const totalNew = data ? data.newUsers.reduce((a, b) => a + b, 0) : 0;
  const totalEarned = data ? data.earned.reduce((a, b) => a + b, 0) : 0;
  const totalSpent = data ? data.spent.reduce((a, b) => a + b, 0) : 0;
  const flowMax = data ? Math.max(1, ...data.earned, ...data.spent) : 1;

  return (
    <SectionCard title={t("chartsTitle")} icon={LineChart}>
      <p className="text-zinc-500 text-xs mb-3">{t("chartsIntro")}</p>
      {loading ? (
        <div className="text-xs text-zinc-500 flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin" /> {t("loading")}</div>
      ) : !data || (totalNew === 0 && totalEarned === 0 && totalSpent === 0) ? (
        <div className="text-xs text-zinc-500 text-center py-4 border border-zinc-900 bg-black/20">{t("chartsEmpty")}</div>
      ) : (
        <div className="space-y-5">
          {/* New users — animated line/area */}
          <div className="border border-zinc-800 bg-black/30 p-3">
            <div className="flex items-baseline justify-between mb-2">
              <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">{t("chartNewUsers")}</div>
              <div className="text-sm font-bold text-white tabular-nums">+{totalNew.toLocaleString(nf)}</div>
            </div>
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-20" preserveAspectRatio="none" aria-hidden>
              <path d={areaPath(data.newUsers, W, H)} fill="rgba(229,9,20,0.14)" />
              <path d={linePath(data.newUsers, W, H)} fill="none" stroke="var(--brand)" strokeWidth="2" className="gechart-line" pathLength={600} />
            </svg>
            <div className="flex justify-between text-[9px] font-mono text-zinc-600 mt-1">
              <span>{data.days[0]?.slice(5)}</span><span>{data.days[data.days.length - 1]?.slice(5)}</span>
            </div>
          </div>

          {/* GT flow — grouped animated bars */}
          <div className="border border-zinc-800 bg-black/30 p-3">
            <div className="flex items-baseline justify-between mb-2">
              <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">{t("chartFlow")}</div>
              <div className="text-[11px] font-mono tabular-nums">
                <span className="text-emerald-400">+{totalEarned.toLocaleString(nf)}</span>
                <span className="text-zinc-600"> / </span>
                <span className="text-red-400">−{totalSpent.toLocaleString(nf)}</span>
              </div>
            </div>
            <div className="flex items-end gap-[2px] h-20">
              {data.days.map((d, i) => (
                <div key={d} className="flex-1 flex items-end gap-[1px] min-w-0" title={`${d} · +${data.earned[i]} / −${data.spent[i]}`}>
                  <div className="flex-1 bg-emerald-500/80 gebar" style={{ height: `${(data.earned[i] / flowMax) * 100}%`, animationDelay: `${i * 18}ms` }} />
                  <div className="flex-1 bg-red-500/70 gebar" style={{ height: `${(data.spent[i] / flowMax) * 100}%`, animationDelay: `${i * 18 + 60}ms` }} />
                </div>
              ))}
            </div>
            <div className="flex items-center gap-3 mt-2 text-[9px] font-mono text-zinc-500">
              <span className="inline-flex items-center gap-1"><span className="w-2 h-2 bg-emerald-500/80 inline-block" /> {t("legendEarned")}</span>
              <span className="inline-flex items-center gap-1"><span className="w-2 h-2 bg-red-500/70 inline-block" /> {t("legendSpent")}</span>
            </div>
          </div>

          {/* Cohort retention grid */}
          <div className="border border-zinc-800 bg-black/30 p-3">
            <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-1">{t("cohortTitle")}</div>
            <p className="text-[10px] text-zinc-600 mb-2">{t("cohortIntro")}</p>
            {data.cohorts.length === 0 ? (
              <div className="text-xs text-zinc-500 text-center py-3">{t("chartsEmpty")}</div>
            ) : (
              <div className="overflow-x-auto">
                <div className="inline-block min-w-full">
                  <div className="flex items-center gap-[2px] mb-[2px]">
                    <div className="w-14 shrink-0" />
                    <div className="w-9 shrink-0 text-[8px] font-mono text-zinc-600 text-end pe-1">{t("cohortSize")}</div>
                    {data.cohorts[0].cells.map((_, i) => (
                      <div key={i} className="w-9 text-center text-[8px] font-mono text-zinc-600">T+{i}</div>
                    ))}
                  </div>
                  {data.cohorts.map((row) => (
                    <div key={row.cohort} className="flex items-center gap-[2px] mb-[2px]">
                      <div className="w-14 shrink-0 text-[9px] font-mono text-zinc-500">{row.cohort.slice(5)}</div>
                      <div className="w-9 shrink-0 text-[9px] font-mono text-zinc-400 text-end pe-1 tabular-nums">{row.size}</div>
                      {row.cells.map((c, i) => (
                        <div
                          key={i}
                          title={c ? `${c.users} (${c.pct}%)` : ""}
                          className="w-9 h-6 rounded-[2px] flex items-center justify-center text-[8px] font-mono tabular-nums"
                          style={c
                            ? { background: `rgba(229,9,20,${(0.08 + (c.pct / 100) * 0.8).toFixed(3)})`, color: c.pct > 45 ? "#fff" : "#a1a1aa" }
                            : { background: "rgba(255,255,255,0.02)" }}
                        >
                          {c ? `${c.pct}%` : ""}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </SectionCard>
  );
}

export function AnalyticsSection() {
  return (
    <div className="space-y-6">
      <GrowthCharts />
      <StreamSessionsCard />
      <ChatHeatmap />
    </div>
  );
}
