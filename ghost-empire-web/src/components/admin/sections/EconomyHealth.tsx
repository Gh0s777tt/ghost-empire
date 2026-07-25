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
import { CHIP_SYMBOL } from "@/lib/shop-currency";
import { SectionCard } from "../shared";
import { apiGet, apiPatch, ApiError } from "@/lib/api-client";

type Health = { burnRatio: number; status: "inflating" | "healthy" | "contracting" };
type ReasonRow = { reason: string; total: number; count: number };
type DayRow = { date: string; earned: number; spent: number };
type UserRow = { name: string; image: string | null; amount: number };
/** The chips loop: same shape as the GT block minus the trend / top-user lists. */
type ChipsData = {
  circulating: number;
  minted: number;
  burned: number;
  net: number;
  txCount: number;
  health: Health;
  sources: ReasonRow[];
  sinks: ReasonRow[];
};
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
  trendDays: number;
  daily: DayRow[];
  topEarners: UserRow[];
  topSpenders: UserRow[];
  /** Absent on responses from an older deploy — the block simply doesn't render. */
  chips?: ChipsData;
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

// Daily earned (red) vs spent (emerald) over the trend window — two mini-bars per day.
function TrendChart({ daily, sym, label, earnedLabel, spentLabel }: { daily: DayRow[]; sym: string; label: string; earnedLabel: string; spentLabel: string }) {
  const nf = useLocale();
  const max = daily.reduce((m, d) => Math.max(m, d.earned, d.spent), 0) || 1;
  return (
    <div className="border border-zinc-800 bg-black/30 p-3 mb-3">
      <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-2">{label}</div>
      <div className="flex items-end gap-1 h-28">
        {daily.map((d) => (
          <div key={d.date} className="flex-1 flex items-end justify-center gap-0.5 h-full" title={`${d.date} · +${d.earned.toLocaleString(nf)} / −${d.spent.toLocaleString(nf)} ${sym}`}>
            <div className="w-1/2 bg-red-500/55 rounded-t-sm min-h-px" style={{ height: `${(d.earned / max) * 100}%` }} />
            <div className="w-1/2 bg-emerald-500/45 rounded-t-sm min-h-px" style={{ height: `${(d.spent / max) * 100}%` }} />
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3 mt-1.5 text-[10px] text-zinc-500">
        <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-red-500/55" /> {earnedLabel}</span>
        <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-emerald-500/45" /> {spentLabel}</span>
      </div>
    </div>
  );
}

function TopUsers({ rows, label, sym }: { rows: UserRow[]; label: string; sym: string }) {
  const nf = useLocale();
  return (
    <div className="border border-zinc-800 bg-black/30 p-3">
      <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-2">{label}</div>
      {rows.length === 0 ? <div className="text-xs text-zinc-600 py-1">—</div> : (
        <div className="space-y-1.5">
          {rows.map((r, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              <span className="text-zinc-600 font-mono w-3 shrink-0">{i + 1}</span>
              {r.image ? <img src={r.image} alt="" className="w-4 h-4 rounded-full shrink-0" loading="lazy" decoding="async" /> : <span className="w-4 h-4 rounded-full bg-zinc-800 shrink-0" />}
              <span className="text-zinc-300 truncate flex-1">{r.name}</span>
              <span className="font-mono tabular-nums text-zinc-400 shrink-0">{r.amount.toLocaleString(nf)} {sym}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Owner control for the casino's free daily chips grant (`Tenant.dailyChipsAmount`).
 * Loads its own state so the read-only dashboard above stays a pure fetch — and so a portal
 * on a pre-migration deploy simply shows nothing instead of breaking the whole section.
 */
function DailyChipsControl() {
  const t = useTranslations("admin.economyHealth");
  const [value, setValue] = useState<string | null>(null);
  const [bounds, setBounds] = useState<{ min: number; max: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const d = await apiGet<{ dailyChipsAmount: number; min: number; max: number }>("/api/admin/casino-config");
        if (!cancelled) { setValue(String(d.dailyChipsAmount)); setBounds({ min: d.min, max: d.max }); }
      } catch { /* nie blokuj dashboardu — kontrolka po prostu się nie pokaże */ }
    })();
    return () => { cancelled = true; };
  }, []);

  if (value === null || !bounds) return null;

  async function save() {
    setBusy(true); setErr(null); setSaved(false);
    try {
      const d = await apiPatch<{ dailyChipsAmount: number }>("/api/admin/casino-config", { dailyChipsAmount: Number(value) });
      setValue(String(d.dailyChipsAmount)); // serwer mógł przyciąć do widełek — pokaż, co zapisał
      setSaved(true);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : t("dailyChipsErr"));
    } finally { setBusy(false); }
  }

  return (
    <div className="border border-amber-900/40 bg-amber-950/10 p-3 mt-2">
      <div className="text-[10px] font-mono uppercase tracking-widest text-amber-500/70 mb-1">
        {t("dailyChipsLabel", { min: bounds.min, max: bounds.max })}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="number"
          value={value}
          min={bounds.min}
          max={bounds.max}
          onChange={(e) => { setValue(e.target.value); setSaved(false); }}
          className="w-32 bg-black border border-zinc-800 px-2 py-1.5 text-sm text-white focus:border-amber-500 outline-hidden tabular-nums"
        />
        <span className="text-amber-300">{CHIP_SYMBOL}</span>
        <button
          onClick={save}
          disabled={busy}
          className="px-3 py-1.5 border border-amber-700 text-amber-300 bg-amber-950/30 hover:bg-amber-950/50 text-[10px] font-bold tracking-widest uppercase disabled:opacity-50 flex items-center gap-1.5"
        >
          {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : null}{t("dailyChipsSave")}
        </button>
        {saved && <span className="text-[10px] text-emerald-400">{t("dailyChipsSaved")}</span>}
        {err && <span className="text-[10px] text-red-400">{err}</span>}
      </div>
      <p className="text-[10px] text-zinc-500 mt-1 leading-snug">{t("dailyChipsHint")}</p>
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

          {data.daily && data.daily.length > 0 && (
            <TrendChart daily={data.daily} sym={sym} label={t("trendTitle", { days: data.trendDays })} earnedLabel={t("earned")} spentLabel={t("spent")} />
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
            <FlowList rows={data.sources} tone="source" label={t("sourcesTitle")} icon={<ArrowUpRight className="w-3 h-3" />} />
            <FlowList rows={data.sinks} tone="sink" label={t("sinksTitle")} icon={<ArrowDownRight className="w-3 h-3" />} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <TopUsers rows={data.topEarners ?? []} label={t("topEarners")} sym={sym} />
            <TopUsers rows={data.topSpenders ?? []} label={t("topSpenders")} sym={sym} />
          </div>

          {/* The second loop. Rendered only when the portal actually uses chips, so a
              GT-only portal's dashboard looks exactly as it did before. */}
          {data.chips && (data.chips.circulating > 0 || data.chips.txCount > 0) && (
            <div className="mt-5 pt-4 border-t border-zinc-800">
              <div className="flex items-baseline gap-2 mb-1">
                <span className="text-sm font-bold text-amber-200">{CHIP_SYMBOL} {t("chipsTitle")}</span>
              </div>
              <p className="text-zinc-500 text-xs mb-3">{t("chipsIntro")}</p>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
                <div className="border border-amber-900/40 bg-amber-950/10 p-3">
                  <div className="text-[10px] font-mono uppercase tracking-widest text-amber-500/70 mb-1">{t("chipsCirculating")}</div>
                  <div className="text-sm font-bold text-amber-100 tabular-nums">{data.chips.circulating.toLocaleString(nf)} {CHIP_SYMBOL}</div>
                </div>
                <div className="border border-amber-900/40 bg-amber-950/10 p-3">
                  <div className="text-[10px] font-mono uppercase tracking-widest text-amber-500/70 mb-1">{t("minted", { days: data.windowDays })}</div>
                  <div className="text-sm font-bold text-red-300 tabular-nums">+{data.chips.minted.toLocaleString(nf)}</div>
                </div>
                <div className="border border-amber-900/40 bg-amber-950/10 p-3">
                  <div className="text-[10px] font-mono uppercase tracking-widest text-amber-500/70 mb-1">{t("burned", { days: data.windowDays })}</div>
                  <div className="text-sm font-bold text-emerald-300 tabular-nums">−{data.chips.burned.toLocaleString(nf)}</div>
                </div>
                <div className="border border-amber-900/40 bg-amber-950/10 p-3">
                  <div className="text-[10px] font-mono uppercase tracking-widest text-amber-500/70 mb-1">{t("net")}</div>
                  <div className={cn("text-sm font-bold tabular-nums", data.chips.net > 0 ? "text-amber-300" : "text-emerald-300")}>
                    {data.chips.net > 0 ? "+" : ""}{data.chips.net.toLocaleString(nf)}
                  </div>
                </div>
              </div>

              <div className={cn("border px-3 py-2 mb-3 text-xs", STATUS_STYLE[data.chips.health.status])}>
                <span className="font-bold">{t(`status_${data.chips.health.status}`)}</span>
                <span className="text-zinc-400"> · {t("burnRatio", { pct: Math.round(Math.min(data.chips.health.burnRatio, 9.99) * 100) })}</span>
                <span className="block text-zinc-500 mt-0.5">{t("chipsHint")}</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <FlowList rows={data.chips.sources} tone="source" label={t("chipsSourcesTitle")} icon={<ArrowUpRight className="w-3 h-3" />} />
                <FlowList rows={data.chips.sinks} tone="sink" label={t("chipsSinksTitle")} icon={<ArrowDownRight className="w-3 h-3" />} />
              </div>

              {/* The one knob that moves the numbers above: the casino's main faucet. Sitting
                  next to the loop it feeds is the point — you tune it against what you see. */}
              <DailyChipsControl />
            </div>
          )}

          <p className="text-[10px] text-zinc-600 mt-2">{t("windowNote", { days: data.windowDays, count: data.txCount.toLocaleString(nf) })}</p>
        </>
      )}
    </SectionCard>
  );
}
