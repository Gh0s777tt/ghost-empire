"use client";
// src/components/admin/sections/Community.tsx
// Lazily-loaded read-only stats for the social features: top Ghost Companions and
// top clans + totals (the GT they sink). Data from /api/admin/community.
import { useState, useEffect } from "react";
import { Users, Loader2, Crown, Shield } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { useTenantBranding } from "@/components/TenantBranding";
import { SectionCard } from "../shared";
import { apiGet } from "@/lib/api-client";

type CompanionRow = { name: string; xp: number; owner: string; emoji: string };
type ClanRow = { name: string; tag: string; treasury: number; members: number };
type CommunityData = {
  companions: { count: number; totalFed: number; top: CompanionRow[] };
  clans: { count: number; totalTreasury: number; top: ClanRow[] };
};

function Metric({ label, value, tone }: { label: string; value: string; tone?: "red" }) {
  return (
    <div className="border border-zinc-800 bg-black/30 p-3">
      <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-1">{label}</div>
      <div className={`text-sm font-bold tabular-nums ${tone === "red" ? "text-red-300" : "text-white"}`}>{value}</div>
    </div>
  );
}

export function CommunitySection() {
  const t = useTranslations("admin.community");
  const nf = useLocale();
  const { tokenSymbol } = useTenantBranding();
  const sym = tokenSymbol || "GT";
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<CommunityData | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try { const d = await apiGet<CommunityData>("/api/admin/community"); if (!cancelled) setData(d); }
      catch { /* leave empty */ } finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <SectionCard title={t("title")} icon={Users}>
      <p className="text-zinc-500 text-xs mb-3">{t("intro")}</p>
      {loading ? (
        <div className="text-xs text-zinc-500 flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin" /> {t("loading")}</div>
      ) : !data ? (
        <div className="text-xs text-zinc-500 text-center py-4 border border-zinc-900 bg-black/20">{t("empty")}</div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
            <Metric label={t("companions")} value={data.companions.count.toLocaleString(nf)} />
            <Metric label={t("totalFed")} value={`${data.companions.totalFed.toLocaleString(nf)} ${sym}`} tone="red" />
            <Metric label={t("clans")} value={data.clans.count.toLocaleString(nf)} />
            <Metric label={t("totalTreasury")} value={`${data.clans.totalTreasury.toLocaleString(nf)} ${sym}`} tone="red" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div className="border border-zinc-800 bg-black/30 p-3">
              <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-2"><Crown className="w-3 h-3" />{t("topCompanions")}</div>
              {data.companions.top.length === 0 ? <div className="text-xs text-zinc-600 py-2">—</div> : (
                <div className="space-y-1.5">
                  {data.companions.top.map((c, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <span className="w-4 text-center text-zinc-500 font-mono shrink-0">{i + 1}</span>
                      <span className="text-base shrink-0">{c.emoji}</span>
                      <span className="text-zinc-200 truncate flex-1">{c.name} <span className="text-zinc-500">· {c.owner}</span></span>
                      <span className="font-mono tabular-nums text-zinc-400 shrink-0">{c.xp.toLocaleString(nf)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="border border-zinc-800 bg-black/30 p-3">
              <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-2"><Shield className="w-3 h-3" />{t("topClans")}</div>
              {data.clans.top.length === 0 ? <div className="text-xs text-zinc-600 py-2">—</div> : (
                <div className="space-y-1.5">
                  {data.clans.top.map((c, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <span className="w-4 text-center text-zinc-500 font-mono shrink-0">{i + 1}</span>
                      <span className="px-1.5 py-0.5 rounded bg-white/5 text-[10px] font-mono font-bold shrink-0" style={{ color: "var(--brand)" }}>{c.tag}</span>
                      <span className="text-zinc-200 truncate flex-1">{c.name} <span className="text-zinc-500">· 👥 {c.members}</span></span>
                      <span className="font-mono tabular-nums text-zinc-400 shrink-0">{c.treasury.toLocaleString(nf)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </SectionCard>
  );
}
