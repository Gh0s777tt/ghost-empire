"use client";
// src/components/admin/sections/Subscribers.tsx
// Subscriber roster (#701): read-only list of accounts flagged as platform subscribers
// (Twitch/Kick/YouTube), with tier + months, so the owner can verify/control who's subscribed.
// Data from /api/admin/subscribers (admin-gated, tenant-scoped). Filter by platform + search.
import { useState, useEffect, useCallback, useMemo } from "react";
import { useTranslations } from "next-intl";
import { Heart, Loader2, ShieldCheck, Star } from "lucide-react";
import { SectionCard, ListSearch } from "../shared";
import { apiGet } from "@/lib/api-client";
import { displayNick, cn } from "@/lib/utils";
import { Link } from "@/i18n/navigation";

type Sub = {
  platform: string;
  handle: string | null;
  subTier: string | null;
  subMonths: number;
  isModerator: boolean;
  isVip: boolean;
  isOG: boolean;
  userId: string;
  username: string | null;
  displayName: string | null;
  image: string | null;
};

const PLATFORM_META: Record<string, { emoji: string; label: string; color: string }> = {
  twitch: { emoji: "💜", label: "Twitch", color: "#9146FF" },
  kick: { emoji: "🟢", label: "Kick", color: "#53FC18" },
  youtube: { emoji: "📺", label: "YouTube", color: "#FF0000" },
  discord: { emoji: "👾", label: "Discord", color: "#5865F2" },
};

export function SubscribersManager() {
  const t = useTranslations("admin");
  const [data, setData] = useState<{ subscribers: Sub[]; total: number; byPlatform: Record<string, number> } | null>(null);
  const [loading, setLoading] = useState(true);
  const [platform, setPlatform] = useState("all");
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    try { setData(await apiGet<{ subscribers: Sub[]; total: number; byPlatform: Record<string, number> }>("/api/admin/subscribers")); }
    catch { /* keep null → empty */ }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const subs = useMemo(() => data?.subscribers ?? [], [data]);
  const platforms = useMemo(() => [...new Set(subs.map((s) => s.platform))], [subs]);
  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return subs.filter(
      (s) =>
        (platform === "all" || s.platform === platform) &&
        (!ql || `${s.displayName ?? ""} ${s.username ?? ""} ${s.handle ?? ""}`.toLowerCase().includes(ql)),
    );
  }, [subs, platform, q]);

  return (
    <SectionCard title={t("subsTitle")} icon={Heart}>
      {loading ? (
        <div className="text-zinc-600 text-sm flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> …</div>
      ) : subs.length === 0 ? (
        <p className="text-zinc-500 text-sm">{t("subsEmpty")}</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-3">
            <span>{t("subsTotal")}: <span className="text-white">{data?.total ?? subs.length}</span></span>
            {platforms.map((p) => (
              <span key={p}>{PLATFORM_META[p]?.emoji ?? "🔗"} {PLATFORM_META[p]?.label ?? p}: <span className="text-white">{data?.byPlatform?.[p] ?? 0}</span></span>
            ))}
          </div>

          {platforms.length > 1 && (
            <div className="flex flex-wrap gap-2 mb-3">
              {["all", ...platforms].map((p) => (
                <button
                  key={p}
                  onClick={() => setPlatform(p)}
                  className={cn(
                    "px-3 py-1.5 border text-[11px] font-semibold tracking-widest uppercase flex items-center gap-1.5 transition-all",
                    platform === p ? "border-red-500 bg-red-600/15 text-red-300" : "border-zinc-800 bg-zinc-950/50 text-zinc-400 hover:border-zinc-600",
                  )}
                >
                  {p === "all" ? t("subsAll") : `${PLATFORM_META[p]?.emoji ?? "🔗"} ${PLATFORM_META[p]?.label ?? p}`}
                </button>
              ))}
            </div>
          )}

          <ListSearch value={q} onChange={setQ} placeholder={t("subsSearch")} shown={filtered.length} total={subs.length} />

          <div className="space-y-1.5 max-h-[34rem] overflow-y-auto pr-1 mt-3">
            {filtered.map((s, i) => {
              const meta = PLATFORM_META[s.platform] ?? { emoji: "🔗", label: s.platform, color: "#888" };
              const name = displayNick(s.displayName, s.username);
              return (
                <div key={`${s.userId}-${s.platform}-${i}`} className="border border-zinc-800 bg-black/30 p-2.5 flex items-center gap-3">
                  {s.image ? (
                    <img src={s.image} alt="" width={28} height={28} loading="lazy" referrerPolicy="no-referrer" className="w-7 h-7 object-cover border border-zinc-800 shrink-0" />
                  ) : (
                    <img src="/brand/eforge-mark.svg" alt="" width={28} height={28} className="w-7 h-7 object-cover border border-zinc-800 bg-black shrink-0" loading="lazy" decoding="async" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {s.username ? (
                        <Link href={`/u/${s.username}`} className="text-sm text-white font-medium truncate hover:text-red-400">{name}</Link>
                      ) : (
                        <span className="text-sm text-white font-medium truncate">{name}</span>
                      )}
                      <span className="text-[10px]" style={{ color: meta.color }}>{meta.emoji}</span>
                      <span className="text-[10px] font-mono text-zinc-500 truncate">@{s.handle ?? "—"}</span>
                    </div>
                  </div>
                  <div className="shrink-0 flex items-center gap-1.5">
                    {s.isOG && <span className="text-[9px] font-bold tracking-widest uppercase px-1.5 py-0.5 border border-amber-700 bg-amber-950/30 text-amber-300">OG</span>}
                    {s.isModerator && <ShieldCheck className="w-3 h-3 text-blue-400" />}
                    {s.isVip && <Star className="w-3 h-3 text-pink-400" />}
                    <span className="text-[9px] font-bold tracking-widest uppercase px-2 py-0.5 border" style={{ borderColor: meta.color + "80", color: meta.color }}>
                      {(s.subTier ?? "SUB")} · {s.subMonths} {t("subsMo")}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
      <p className="text-[10px] font-mono text-zinc-600 mt-3 leading-snug">{t("subsNote")}</p>
    </SectionCard>
  );
}
