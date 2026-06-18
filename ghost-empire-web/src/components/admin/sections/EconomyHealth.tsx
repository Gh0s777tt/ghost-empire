"use client";
// src/components/admin/sections/EconomyHealth.tsx
// Lazily-loaded admin tool: the health of the GT economy — circulating supply +
// last-30-days mint vs burn balance + top GT sources (faucets) and sinks. Surfaces
// inflation before tokens lose their value. Read-only; data from /api/admin/economy-health.
import { useState, useEffect } from "react";
import { Coins, Loader2, ArrowDownRight, ArrowUpRight } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { cn } from "@/lib/utils";
import { useTenantBranding } from "@/components/TenantBranding";
import { SectionCard } from "../shared";
import { apiGet } from "@/lib/api-client";

type Health = { burnRatio: number; status: "inflating" | "healthy" | "contracting" };
type ReasonRow = { reason: string; total: number; count: number };
type EconomyData = {
  windowDays: number;
  circulating: number;
  minted: number;
  burned: number;
  net: number;
  txCount: number;
  health: Health;
  sources: ReasonRow[];
  sinks: ReasonRow[];
};

const STATUS_STYLE: Record<Health["status"], string> = {
  inflating: "border-amber-700/60 bg-amber-950/20 text-amber-300",
  healthy: "border-emerald-700/60 bg-emerald-950/20 text-emerald-300",
  contracting: "border-sky-700/60 bg-sky-950/20 text-sky-300",
};

// Reasons are raw codes ("kick_sub_new", "donation:streamlabs:abc", "shop:item").
// Show the human-meaningful head: drop the ":id" tail, spaces for underscores.
function prettyReason(reason: string): string {
  const head = reason.split(":")[0].replace(/_/g, " ").trim();
  return head.charAt(0).toUpperCase() + head.slice(1) || reason;
}

function FlowList({
  rows, tone, label, icon,
}: {
  rows: ReasonRow[];
  tone: "source" | "sink";
  label: string;
  icon: React.ReactNode;
}) {
  const nf = useLocale();
  const max = rows.reduce((m, r) => Math.max(m, r.total), 0) || 1;
  const bar = tone === "source" ? "bg-red-500/55" : "bg-emerald-500/45";
  return (
    <div className="border border-zinc-800 bg-black/30 p-3">
      <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-2">
        {icon}{label}
      </div>
      {rows.length === 0 ? (
        <div className="text-xs text-zinc-600 py-2">—</div>
      ) : (
        <div className="space-y-1.5">
          {rows.map((r) => (
            <div key={r.reason}>
              <div className="flex items-baseline justify-between gap-2 text-xs mb-0.5">
                <span className="text-zinc-300 truncate" title={r.reason}>{prettyReason(r.reason)}</span>
                <span className="font-mono tabular-nums text-zinc-400 shrink-0">{r.total.toLocaleString(nf)}</span>
              </div>
              <div className="h-1.5 rounded-sm bg-white/5 overflow-hidden">
                <div className={cn("h-full rounded-sm", bar)} style={{ width: `${Math.max(2, (r.total / max) * 100).toFixed(1)}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function EconomyHealthSection() {
  const t = useTranslations("admin.economyHealth");
  const nf = useLocale();
  const { tokenSymbol } = useTenantBranding();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<EconomyData | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const d = await apiGet<EconomyData>("/api/admin/economy-health");
        if (!cancelled) setData(d);
      } catch { /* leave empty */ } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const sym = tokenSymbol || "GT";
  const fmtGt = (n: number) => `${n.toLocaleString(nf)} ${sym}`;

  return (
    <SectionCard title={t("title")} icon={Coins}>
      <p className="text-zinc-500 text-xs mb-3">{t("intro")}</p>

      {loading ? (
        <div className="text-xs text-zinc-500 flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin" /> {t("loading")}</div>
      ) : !data ? (
        <div className="text-xs text-zinc-500 text-center py-4 border border-zinc-900 bg-black/20">{t("empty")}</div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
            <div className="border border-zinc-800 bg-black/30 p-3">
              <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-1">{t("circulating")}</div>
              <div className="text-sm font-bold text-white tabular-nums">{fmtGt(data.circulating)}</div>
            </div>
            <div className="border border-zinc-800 bg-black/30 p-3">
              <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-1">{t("minted", { days: data.windowDays })}</div>
              <div className="text-sm font-bold text-red-300 tabular-nums">+{data.minted.toLocaleString(nf)}</div>
            </div>
            <div className="border border-zinc-800 bg-black/30 p-3">
              <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-1">{t("burned", { days: data.windowDays })}</div>
              <div className="text-sm font-bold text-emerald-300 tabular-nums">−{data.burned.toLocaleString(nf)}</div>
            </div>
            <div className="border border-zinc-800 bg-black/30 p-3">
              <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-1">{t("net")}</div>
              <div className={cn("text-sm font-bold tabular-nums", data.net > 0 ? "text-amber-300" : "text-emerald-300")}>
                {data.net > 0 ? "+" : ""}{data.net.toLocaleString(nf)}
              </div>
            </div>
          </div>

          <div className={cn("border px-3 py-2 mb-4 text-xs", STATUS_STYLE[data.health.status])}>
            <span className="font-bold">{t(`status_${data.health.status}`)}</span>
            <span className="text-zinc-400"> · {t("burnRatio", { pct: Math.round(Math.min(data.health.burnRatio, 9.99) * 100) })}</span>
            <span className="block text-zinc-500 mt-0.5">{t(`hint_${data.health.status}`)}</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <FlowList rows={data.sources} tone="source" label={t("sourcesTitle")} icon={<ArrowUpRight className="w-3 h-3" />} />
            <FlowList rows={data.sinks} tone="sink" label={t("sinksTitle")} icon={<ArrowDownRight className="w-3 h-3" />} />
          </div>

          <p className="text-[10px] text-zinc-600 mt-2">{t("windowNote", { days: data.windowDays, count: data.txCount.toLocaleString(nf) })}</p>
        </>
      )}
    </SectionCard>
  );
}
