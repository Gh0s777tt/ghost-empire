"use client";
// src/components/admin/sections/ModViolationStats.tsx
// Moderation stats + top repeat offenders, fed by /api/admin/mod-violations.
// Violations are logged by the bot after it enforces an automod action.
import { useEffect, useState } from "react";
import { BarChart3, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";

type Stats = {
  byType: Array<{ violation: string; count: number }>;
  total24h: number;
  total7d: number;
  recent: Array<{ id: string; platform: string; username: string; violation: string; action: string; priorCount: number; at: string }>;
  topOffenders: Array<{ platform: string; username: string; count: number }>;
};

const PLATFORM_DOT: Record<string, string> = { twitch: "#9146FF", kick: "#53FC18", youtube: "#FF0000" };

export function ModViolationStats() {
  const t = useTranslations("admin.modViolations");
  const VIOLATION_PL = t.raw("violation") as Record<string, string>;
  const ACTION_PL = t.raw("action") as Record<string, string>;
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/mod-violations");
      if (r.ok) setStats(await r.json());
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { void load(); }, []);

  if (!stats) {
    return <div className="border border-zinc-800 bg-black/30 p-3 mb-3 text-xs text-zinc-500">{t("loading")}</div>;
  }

  const maxType = Math.max(1, ...stats.byType.map((b) => b.count));

  return (
    <div className="border border-zinc-800 bg-black/30 p-3 mb-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-zinc-400">
          <BarChart3 className="w-3.5 h-3.5" /> {t("statsTitle")}
        </div>
        <button onClick={load} disabled={loading} className="text-zinc-500 hover:text-zinc-300 disabled:opacity-50" title={t("refresh")}>
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="bg-black/40 border border-zinc-900 px-3 py-2">
          <div className="text-[9px] font-mono uppercase tracking-widest text-zinc-500">{t("last24h")}</div>
          <div className="text-xl font-bold text-white">{stats.total24h.toLocaleString("pl-PL")}</div>
        </div>
        <div className="bg-black/40 border border-zinc-900 px-3 py-2">
          <div className="text-[9px] font-mono uppercase tracking-widest text-zinc-500">{t("last7d")}</div>
          <div className="text-xl font-bold text-white">{stats.total7d.toLocaleString("pl-PL")}</div>
        </div>
      </div>

      {stats.byType.length > 0 ? (
        <div className="space-y-1 mb-3">
          {stats.byType.sort((a, b) => b.count - a.count).map((b) => (
            <div key={b.violation} className="flex items-center gap-2">
              <span className="text-[10px] text-zinc-400 w-20 shrink-0">{VIOLATION_PL[b.violation] ?? b.violation}</span>
              <div className="flex-1 bg-zinc-900 h-3 rounded-sm overflow-hidden">
                <div className="h-full bg-blue-600" style={{ width: `${(b.count / maxType) * 100}%` }} />
              </div>
              <span className="text-[10px] font-mono text-zinc-400 w-8 text-right">{b.count}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[11px] text-zinc-600 mb-3">{t("noViolations")}</p>
      )}

      {stats.topOffenders.length > 0 && (
        <div className="mb-2">
          <div className="text-[9px] font-mono uppercase tracking-widest text-zinc-500 mb-1">{t("topOffenders")}</div>
          <div className="flex flex-wrap gap-1.5">
            {stats.topOffenders.map((o) => (
              <span key={`${o.platform}:${o.username}`} className="inline-flex items-center gap-1 bg-black/40 border border-zinc-900 px-2 py-0.5 text-[10px]">
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: PLATFORM_DOT[o.platform] ?? "#888" }} />
                <span className="text-zinc-300">{o.username}</span>
                <span className="text-zinc-500 font-mono">×{o.count}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {stats.recent.length > 0 && (
        <details className="mt-2">
          <summary className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 cursor-pointer hover:text-zinc-300">
            {t("recentSummary", { count: stats.recent.length })}
          </summary>
          <ul className="mt-1 space-y-0.5 max-h-48 overflow-y-auto">
            {stats.recent.map((r) => (
              <li key={r.id} className="flex items-center gap-2 text-[10px] bg-black/30 px-2 py-1">
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: PLATFORM_DOT[r.platform] ?? "#888" }} />
                <span className="text-zinc-300 w-24 truncate">{r.username}</span>
                <span className="text-zinc-500 flex-1">{VIOLATION_PL[r.violation] ?? r.violation}</span>
                <span className="text-zinc-400">{ACTION_PL[r.action] ?? r.action}{r.priorCount > 0 ? ` ·×${r.priorCount + 1}` : ""}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
