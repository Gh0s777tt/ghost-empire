"use client";
// src/components/home/HomeClient.tsx
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { useTranslations, useLocale } from "next-intl";
import { Radio, Eye, Target, Flame, Calendar, Award, ChevronRight, Check, Clock, Zap, Gift, Trophy, type LucideIcon } from "lucide-react";
import { timeLeft, rankForLevel, levelProgress, displayNick } from "@/lib/utils";
import { Link } from "@/i18n/navigation";
import { useLocaleFmt } from "@/lib/use-locale-fmt";
import { EmptyState } from "@/components/EmptyState";
import { apiGet, apiPost } from "@/lib/api-client";
import { emitBalance } from "@/lib/balance-bus";
import { emitDailyClaimed, DAILY_CLAIMED_EVENT } from "@/lib/daily-bus";
import { GettingStarted } from "./GettingStarted";
import { WatchStreakCard } from "@/components/WatchStreakCard";
import { sfxPlay } from "@/lib/sfx";
import { useTenantBranding } from "@/components/TenantBranding";
import { OnlineNowBadge } from "@/components/OnlineNowBadge";
import type { Session } from "next-auth";

// Shapes mirror the prisma selects in app/[locale]/page.tsx (minimal fields the
// home actually renders) — keep the two in sync when adding fields.
type HomeUser = {
  id: string;
  username: string | null;
  displayName: string | null;
  image: string | null;
  tokens: number;
  totalEarned: number;
  totalSpent: number;
  level: number;
  xp: number;
  messageCount: number;
};
type HomeUserTask = {
  id: string;
  progress: number;
  claimed: boolean;
  task: { id: string; code: string; text: string; target: number; reward: number };
};
type HomeUserAchievement = {
  id: string;
  achievement: { code: string; name: string; icon: string; rarity: string };
};
type HomeShopItem = {
  id: string;
  name: string;
  price: number;
  imageEmoji: string | null;
  stock: number;
  totalStock: number | null;
};
type HomeEvent = {
  id: string;
  type: string;
  name: string;
  multiplier: number | null;
  endsAt: Date | string | null;
};
type HomeTopUser = {
  id: string;
  username: string | null;
  displayName: string | null;
  image: string | null;
  tokens: number;
  level: number;
};

type Props = {
  session: Session | null;
  userData: {
    user: HomeUser | null;
    achievements: HomeUserAchievement[];
    tasks: HomeUserTask[];
    connections?: unknown[]; // sent by the page, not rendered here
  } | null;
  hotItems: HomeShopItem[];
  activeEvents: HomeEvent[];
  topUsers: HomeTopUser[];
};


export function HomeClient({ session, userData, hotItems, activeEvents, topUsers }: Props) {
  const router = useRouter();
  const t = useTranslations("home");
  const user = userData?.user;
  const tasks = userData?.tasks ?? [];
  const achievements = userData?.achievements ?? [];

  if (!session) {
    return <GuestView topUsers={topUsers} />;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Live banner — self-hides when the streamer is offline */}
      <LiveBanner />

      {/* Portal presence (#767) — hides itself when dormant/empty */}
      <div className="flex justify-end -mb-2"><OnlineNowBadge /></div>

      {/* Profile hero */}
      {user && <ProfileHero user={user} />}

      {/* Daily login bonus */}
      <DailyBonusCard />

      {/* Watch streak + loyalty (#687) — daily watch check-in, milestone GT + tiers */}
      <WatchStreakCard />

      {/* Getting started — self-hides once every step is done */}
      <GettingStarted />

      {/* Two-column row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Daily tasks */}
        <div className="lg:col-span-1 border border-zinc-800 bg-zinc-950/60 clip-corner">
          <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Target className="w-4 h-4 text-red-500" />
              <h3 className="font-display text-lg tracking-wider text-white">{t("dailyQuests")}</h3>
            </div>
            <span className="font-mono text-[10px] text-zinc-500">{t("resetMidnight")}</span>
          </div>
          <div className="p-4 space-y-3 max-h-[26rem] overflow-y-auto">
            {tasks.length === 0 ? (
              <p className="text-sm text-zinc-500 text-center py-4">{t("loadingTasks")}</p>
            ) : (
              tasks.map((ut) => (
                <DailyTaskCard key={ut.id} userTask={ut} />
              ))
            )}
          </div>
        </div>

        {/* Hot items */}
        <div className="lg:col-span-2 border border-zinc-800 bg-zinc-950/60 clip-corner">
          <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Flame className="w-4 h-4 text-orange-500" />
              <h3 className="font-display text-lg tracking-wider text-white">{t("hotInShop")}</h3>
            </div>
            <button
              onClick={() => router.push("/shop")}
              className="text-[10px] font-bold tracking-wider text-zinc-400 hover:text-red-400 flex items-center gap-1"
            >
              {t("seeAll")} <ChevronRight className="w-3 h-3" />
            </button>
          </div>
          <div className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
            {hotItems.map((item) => (
              <MiniShopCard
                key={item.id}
                item={item}
                userTokens={user?.tokens ?? 0}
                onClick={() => router.push("/shop")}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Active events */}
      <div className="border border-zinc-800 bg-zinc-950/60 clip-corner">
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-red-500" />
            <h3 className="font-display text-lg tracking-wider text-white">{t("activeEvents")}</h3>
          </div>
          <button
            onClick={() => router.push("/events")}
            className="text-[10px] font-bold tracking-wider text-zinc-400 hover:text-red-400 flex items-center gap-1"
          >
            {t("seeAllPlural")} <ChevronRight className="w-3 h-3" />
          </button>
        </div>
        <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
          {activeEvents.map((ev) => (
            <EventMiniCard key={ev.id} event={ev} />
          ))}
          {activeEvents.length === 0 && (
            <div className="col-span-2">
              <EmptyState
                icon={<Calendar className="w-7 h-7" />}
                title={t("noEvents")}
                message={t("noEventsMsg")}
              />
            </div>
          )}
        </div>
      </div>

      {/* Recent achievements */}
      {achievements.length > 0 && (
        <div className="border border-zinc-800 bg-zinc-950/60 clip-corner">
          <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Award className="w-4 h-4 text-yellow-500" />
              <h3 className="font-display text-lg tracking-wider text-white">{t("recentAchievements")}</h3>
            </div>
            <button
              onClick={() => router.push("/achievements")}
              className="text-[10px] font-bold tracking-wider text-zinc-400 hover:text-red-400 flex items-center gap-1"
            >
              {t("seeAllPlural")} <ChevronRight className="w-3 h-3" />
            </button>
          </div>
          <div className="p-4 grid grid-cols-3 sm:grid-cols-6 gap-3">
            {achievements.map((ua) => (
              <AchievementBadgeSmall key={ua.id} achievement={ua.achievement} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---- DAILY LOGIN BONUS ----
// Growing-streak daily claim (50 GT +25/day, cap 200). Status comes from the API;
// claiming updates the header balance instantly via the balance-bus.
function DailyBonusCard() {
  const t = useTranslations("home");
  const fmt = useLocaleFmt();
  const [st, setSt] = useState<{ claimedToday: boolean; streak: number; nextReward: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [justClaimed, setJustClaimed] = useState<number | null>(null);
  const { tokenSymbol } = useTenantBranding();

  const load = useCallback(async () => {
    try { setSt(await apiGet("/api/daily-bonus")); } catch { /* ignore */ }
  }, []);
  useEffect(() => { void load(); }, [load]);

  // Sync with the header indicator: if the bonus is claimed there, reflect it here.
  useEffect(() => {
    const onClaimed = (e: Event) =>
      setSt((s) => (s ? { ...s, claimedToday: true, streak: (e as CustomEvent<number>).detail } : s));
    window.addEventListener(DAILY_CLAIMED_EVENT, onClaimed);
    return () => window.removeEventListener(DAILY_CLAIMED_EVENT, onClaimed);
  }, []);

  async function claim() {
    if (busy || !st || st.claimedToday) return;
    setBusy(true);
    try {
      const d = await apiPost<{ ok: true; reward: number; streak: number; newBalance: number }>("/api/daily-bonus");
      emitBalance(d.newBalance);
      emitDailyClaimed(d.streak);
      sfxPlay("win");
      setJustClaimed(d.reward);
      setSt({ claimedToday: true, streak: d.streak, nextReward: Math.min(50 + 25 * d.streak, 200) });
    } catch {
      void load(); // 409 (already claimed elsewhere) → refresh status
    }
    setBusy(false);
  }

  if (!st) return null;
  return (
    <div className="border border-amber-900/50 bg-gradient-to-r from-amber-950/40 via-zinc-950/60 to-zinc-950/60 clip-corner p-4 flex flex-wrap items-center gap-3">
      <span className="text-2xl">🎁</span>
      <div className="min-w-0 flex-1">
        <div className="font-display text-lg tracking-wider text-white">{t("bonusTitle")}</div>
        <div className="text-xs text-zinc-400 font-mono">
          {t("bonusStreak", { days: st.streak })}
          {st.claimedToday && <span className="ms-2 text-zinc-500">· {t("bonusTomorrow", { amount: fmt(st.nextReward) })}</span>}
        </div>
      </div>
      {st.claimedToday ? (
        <div className="text-sm font-bold text-emerald-300">
          {justClaimed != null ? `+${fmt(justClaimed)} ${tokenSymbol} 🎉` : t("bonusClaimed")}
        </div>
      ) : (
        <button
          onClick={claim}
          disabled={busy}
          className="px-5 py-2.5 rounded-full text-sm font-extrabold text-black bg-gradient-to-r from-amber-400 to-yellow-500 hover:from-amber-300 disabled:opacity-50 transition-all"
        >
          {t("bonusClaim", { amount: fmt(st.nextReward) })}
        </button>
      )}
    </div>
  );
}

// ---- GUEST VIEW ----
function GuestView({ topUsers }: { topUsers: HomeTopUser[] }) {
  const t = useTranslations("home");
  const fmt = useLocaleFmt();
  const { brandName, logoUrl, channels, isPlatformBrand } = useTenantBranding();
  const stats = [
    { label: t("statPlayers"), value: "847+" },
    { label: t("statTokens"), value: "12M+" },
    { label: t("statRewards"), value: "12" },
    { label: t("statEvents"), value: "34" },
  ];
  return (
    <div className="space-y-12 animate-fade-in">
      {/* Live banner — self-hides when the streamer is offline (guests too) */}
      <LiveBanner />
      {/* Hero */}
      <div className="text-center py-16">
        <div className="flex justify-center mb-8">
          <div
            className="w-28 h-28 overflow-hidden rounded-2xl"
            style={{ border: "2px solid rgba(var(--brand-rgb), 0.4)", boxShadow: "0 0 60px rgba(var(--brand-rgb), 0.35)" }}
          >
            <img src={logoUrl ?? "/brand/skull.png"} alt={brandName} className="w-full h-full object-cover" />
          </div>
        </div>
        <h1
          className="font-display text-6xl sm:text-7xl text-white mb-4"
          style={{ textShadow: "3px 0 0 rgba(var(--brand-rgb), 0.7), -3px 0 0 color-mix(in srgb, var(--brand), black 60%)" }}
        >
          {brandName}
        </h1>
        <p className="text-zinc-400 text-lg mb-4 max-w-xl mx-auto">
          {/* Platform brands (E-Forge / founder) are universal — don't name a single
              streamer in the hero; a streamer's own portal keeps the %owner% line (#763). */}
          {t(isPlatformBrand ? "heroSubtitlePlatform" : "heroSubtitle")}
        </p>
        {/* Portal presence (#767) — live "N online now"; hides itself when dormant/empty */}
        <div className="flex justify-center mb-6"><OnlineNowBadge /></div>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={() => signIn()}
            className="px-8 py-4 bg-red-600 hover:bg-red-500 text-white font-bold tracking-widest uppercase transition-all text-sm clip-tag"
          >
            {t("join")}
          </button>
          {channels[0] && (
            <a
              href={channels[0].url}
              target="_blank"
              rel="noreferrer"
              className="px-8 py-4 border border-zinc-700 hover:border-zinc-500 text-zinc-300 font-bold tracking-widest uppercase transition-all text-sm"
            >
              {t("watchLive")}
            </a>
          )}
          {/* Self-service SaaS signup — a streamer can launch their own portal (#660). */}
          <Link
            href="/onboarding"
            className="px-8 py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold tracking-widest uppercase transition-all text-sm clip-tag inline-flex items-center justify-center gap-2"
          >
            🚀 {t("launchPortal")}
          </Link>
        </div>
      </div>

      {/* Stats teaser */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {stats.map((s) => (
          <div key={s.label} className="border border-zinc-800 bg-zinc-950/60 p-4 text-center clip-corner">
            <div className="font-display text-3xl text-red-500">{s.value}</div>
            <div className="font-mono text-[10px] tracking-widest text-zinc-500 mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Top 3 preview */}
      <div>
        <h2 className="font-display text-2xl text-white mb-4">{t("topPlayers")}</h2>
        <div className="space-y-2">
          {topUsers.map((u, i) => (
            <div key={u.id} className="flex items-center gap-4 p-4 border border-zinc-800 bg-zinc-950/60">
              <span className="font-display text-3xl text-zinc-600">#{i + 1}</span>
              <div className="w-10 h-10 border border-zinc-700 overflow-hidden bg-zinc-900 flex items-center justify-center text-lg">
                {u.image ? <img src={u.image} alt="" width={40} height={40} loading="lazy" decoding="async" referrerPolicy="no-referrer" className="w-full h-full object-cover" /> : <img src="/brand/skull.png" alt="" className="w-full h-full object-cover" />}
              </div>
              <div className="flex-1">
                <p className="font-bold text-white">{displayNick(u.displayName, u.username)}</p>
                <p className="text-[10px] text-zinc-500 font-mono">LVL {u.level}</p>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-sm">👻</span>
                <span className="font-mono font-bold text-white">{fmt(u.tokens)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---- PROFILE HERO ----
function ProfileHero({ user }: { user: HomeUser }) {
  const t = useTranslations("home");
  const fmt = useLocaleFmt();
  const { tokenName } = useTenantBranding();
  const rank = rankForLevel(user.level);
  // #756: progress vs the real level boundary (level 1 spans [0,1000) — xp%500 would reset at 500).
  const lp = levelProgress(user.xp);
  const xpPct = lp.pct;

  return (
    <div
      className="relative overflow-hidden border border-zinc-800 p-5 sm:p-7"
      style={{ background: "linear-gradient(135deg, #0a0a0a 0%, #1a0505 100%)" }}
    >
      <div
        className="absolute inset-0 opacity-5 scanlines"
        style={{
          backgroundImage:
            "repeating-linear-gradient(135deg, transparent, transparent 30px, rgba(229,9,20,0.4) 30px, rgba(229,9,20,0.4) 31px)",
        }}
      />
      <div className="relative grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Avatar */}
        <div className="lg:col-span-4 flex items-center gap-4">
          <div className="relative shrink-0">
            <div className="absolute -inset-1 bg-linear-to-br from-red-600 to-red-900 blur-xs opacity-50" />
            <div className="relative w-20 h-20 border-2 border-red-500 overflow-hidden bg-zinc-900 clip-corner">
              {user.image ? (
                <img src={user.image} alt="" width={80} height={80} loading="lazy" decoding="async" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
              ) : (
                <img src="/brand/skull.png" alt="" className="w-full h-full object-cover" />
              )}
            </div>
            <div className="absolute -bottom-1.5 -end-1.5 px-1.5 py-0.5 bg-red-600 text-white font-mono text-[9px] font-bold clip-tag">
              LVL {user.level}
            </div>
          </div>
          <div>
            <h2 className="font-display text-2xl text-white">{displayNick(user.displayName, user.username)}</h2>
            <p className="font-mono text-xs text-zinc-500">@{user.username}</p>
            <div
              className="inline-flex items-center gap-1 mt-2 px-2 py-0.5 border text-[10px] font-mono font-bold tracking-wider"
              style={{ borderColor: rank.color, color: rank.color, background: `${rank.color}15` }}
            >
              {rank.emoji} {rank.name}
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="lg:col-span-8 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatBox icon="👻" label={tokenName.toUpperCase()} value={fmt(user.tokens)} accent />
          <StatBox icon="⬆️" label={t("phEarned")} value={fmt(user.totalEarned)} />
          <StatBox icon="🛍️" label={t("phSpent")} value={fmt(user.totalSpent)} />
          <StatBox icon="💬" label={t("phMessages")} value={fmt(user.messageCount)} />
        </div>

        {/* XP bar */}
        <div className="lg:col-span-12">
          <div className="flex items-end justify-between mb-1.5">
            <span className="font-mono text-[10px] tracking-widest text-zinc-500">
              {t("progressTo", { level: lp.level + 1 })}
            </span>
            <span className="font-mono text-xs text-zinc-400">
              <span className="text-white font-bold">{lp.into}</span>/{lp.span} XP
            </span>
          </div>
          <div className="relative h-2.5 bg-zinc-900 border border-zinc-800 overflow-hidden">
            <div
              className="absolute inset-y-0 start-0 transition-all duration-700"
              style={{
                width: `${xpPct}%`,
                background: "linear-gradient(90deg, #8B0000 0%, #E50914 50%, #FF4500 100%)",
                boxShadow: "0 0 12px rgba(229,9,20,0.5)",
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function StatBox({ icon, label, value, accent = false }: { icon: string; label: string; value: string | number; accent?: boolean }) {
  return (
    <div className={`p-3 border ${accent ? "border-red-900/60" : "border-zinc-800"} bg-black/50 clip-corner`}>
      <div className="flex items-center justify-between mb-1">
        <span className="font-mono text-[9px] tracking-widest text-zinc-500">{label}</span>
        <span className="text-sm">{icon}</span>
      </div>
      <div className={`text-xl font-bold font-mono tabular-nums ${accent ? "text-white" : "text-zinc-200"}`}>
        {value}
      </div>
    </div>
  );
}

// ---- DAILY TASK CARD ----
function DailyTaskCard({ userTask }: { userTask: HomeUserTask }) {
  const t = useTranslations("home");
  const fmt = useLocaleFmt();
  const router = useRouter();
  const { task, progress, claimed } = userTask;
  const pct = Math.min((progress / task.target) * 100, 100);
  const ready = progress >= task.target && !claimed;
  const [busy, setBusy] = useState(false);

  // Check the response (a failed claim used to look identical to success) and do a soft
  // router.refresh() instead of a full window reload; on failure re-enable for a retry. #audit-v2
  const handleClaim = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/tasks/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId: task.id }),
      });
      if (res.ok) { router.refresh(); return; }
    } catch { /* fall through to re-enable */ }
    setBusy(false);
  };

  return (
    <div
      className={`p-3 border transition-all ${
        claimed ? "border-green-600/40 bg-green-950/20" : "border-zinc-800 bg-zinc-900/30"
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <p className="text-xs text-zinc-300 leading-tight flex-1">{task.text}</p>
        <span className="font-mono text-xs text-red-400 font-bold whitespace-nowrap">
          +{fmt(task.reward)} 👻
        </span>
      </div>
      <div className="relative h-1.5 bg-zinc-900 mb-2 overflow-hidden">
        <div
          className={`absolute inset-y-0 start-0 transition-all ${claimed ? "bg-green-500" : "bg-red-600"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] text-zinc-500">
          {progress}/{task.target}
        </span>
        {claimed ? (
          <span className="text-[10px] font-bold tracking-wider text-green-400 flex items-center gap-1">
            <Check className="w-3 h-3" /> {t("taskClaimed")}
          </span>
        ) : ready ? (
          <button
            onClick={handleClaim}
            disabled={busy}
            className="text-[10px] font-bold tracking-wider text-red-400 hover:text-red-300 px-2 py-0.5 border border-red-500/50 hover:border-red-500 transition-all disabled:opacity-50"
          >
            {t("taskClaim")}
          </button>
        ) : (
          <span className="text-[10px] font-bold tracking-wider text-zinc-600">{t("taskInProgress")}</span>
        )}
      </div>
    </div>
  );
}

// ---- MINI SHOP CARD ----
function MiniShopCard({ item, userTokens, onClick }: { item: HomeShopItem; userTokens: number; onClick: () => void }) {
  const t = useTranslations("home");
  const fmt = useLocaleFmt();
  const canAfford = userTokens >= item.price;
  return (
    <button
      onClick={onClick}
      className="relative p-3 border border-zinc-800 hover:border-red-500 bg-zinc-900/40 text-start transition-all group clip-corner w-full"
    >
      <div className="flex items-start gap-3">
        <div className="text-3xl shrink-0">{item.imageEmoji}</div>
        <div className="min-w-0 flex-1">
          {/* Title + HOT badge inline so the badge reserves its own space (flex) and the
              truncated title ellipsises right before it — never overlapping it. */}
          <div className="flex items-center gap-1.5">
            <h4 className="min-w-0 flex-1 text-xs font-bold text-white leading-tight truncate group-hover:text-red-300 transition-colors">
              {item.name}
            </h4>
            <span className="shrink-0 px-1.5 py-0.5 bg-red-600/20 border border-red-500/50 font-mono text-[8px] font-bold text-red-300 tracking-widest leading-none">
              HOT
            </span>
          </div>
          <div className="flex items-center gap-1 mt-1.5">
            <span className="text-xs">👻</span>
            <span className={`font-mono text-xs font-bold tabular-nums ${canAfford ? "text-white" : "text-zinc-600"}`}>
              {fmt(item.price)}
            </span>
          </div>
          {item.stock !== -1 && (
            <div className="font-mono text-[9px] text-zinc-500 mt-0.5">
              {t("stock")}: {item.stock}/{item.totalStock}
            </div>
          )}
        </div>
      </div>
    </button>
  );
}

// ---- EVENT MINI CARD ----
function EventMiniCard({ event }: { event: HomeEvent }) {
  const t = useTranslations("home");
  const locale = useLocale();
  const typeStyles: Record<string, { icon: LucideIcon; color: string; label: string }> = {
    happy_hour: { icon: Zap,    color: "#E50914", label: "HAPPY HOUR" },
    giveaway:   { icon: Gift,   color: "#FFD700", label: "GIVEAWAY" },
    raffle:     { icon: Trophy, color: "#FF9500", label: "RAFFLE" },
    contest:    { icon: Target, color: "#00BFFF", label: t("evContest") },
  };
  const s = typeStyles[event.type] ?? typeStyles.giveaway;
  const Icon = s.icon;

  return (
    <div className="flex items-start gap-3 p-3 border border-zinc-800 bg-zinc-900/30 hover:border-zinc-600 transition-all">
      <div
        className="w-10 h-10 shrink-0 flex items-center justify-center border"
        style={{ borderColor: s.color, background: `${s.color}15` }}
      >
        <Icon className="w-5 h-5" style={{ color: s.color }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="font-mono text-[9px] font-bold tracking-widest" style={{ color: s.color }}>
            {s.label}
          </span>
          {event.multiplier && (
            <span className="font-mono text-[10px] font-bold text-red-300">×{event.multiplier}</span>
          )}
        </div>
        <h4 className="text-sm font-bold text-white leading-tight">{event.name}</h4>
        <div className="flex items-center gap-3 mt-1.5 font-mono text-[10px] text-zinc-500">
          {event.endsAt && (
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {timeLeft(event.endsAt, locale)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ---- ACHIEVEMENT BADGE (small) ----
function AchievementBadgeSmall({ achievement }: { achievement: HomeUserAchievement["achievement"] }) {
  const rarityBg: Record<string, string> = {
    common:    "from-zinc-800 to-zinc-900 border-zinc-600",
    rare:      "from-blue-900 to-blue-950 border-blue-500",
    epic:      "from-purple-900 to-purple-950 border-purple-500",
    legendary: "from-yellow-900 to-orange-950 border-yellow-500",
  };
  const bg = rarityBg[achievement.rarity] ?? rarityBg.common;

  return (
    <div
      className={`p-3 border bg-linear-to-br ${bg} text-center clip-corner hover:scale-105 transition-transform`}
      title={achievement.name}
    >
      <div className="text-2xl">{achievement.icon}</div>
    </div>
  );
}

// ---- LIVE BANNER ----
type LiveData = { live: boolean; viewers?: number; game?: string | null; title?: string | null; watchUrl?: string | null };

// Real-time "LIVE now" banner: polls /api/live-status (cached, Twitch Helix) and
// renders nothing while the streamer is offline. Replaces the old static placeholder.
function LiveBanner() {
  const t = useTranslations("home");
  const fmt = useLocaleFmt();
  const { channels } = useTenantBranding();
  const [live, setLive] = useState<LiveData | null>(null);

  useEffect(() => {
    let alive = true;
    const fetchOnce = () => apiGet<LiveData>("/api/live-status").then((d) => { if (alive) setLive(d); }).catch(() => {});
    void fetchOnce();
    const id = setInterval(() => void fetchOnce(), 60_000); // appears when the stream starts, no refresh
    return () => { alive = false; clearInterval(id); };
  }, []);

  if (!live?.live) return null;

  return (
    <div
      className="relative overflow-hidden border border-red-900/60 clip-corner"
      style={{ background: "linear-gradient(90deg, rgba(139,0,0,0.4) 0%, rgba(0,0,0,0.9) 60%)" }}
    >
      <div
        className="absolute inset-0 opacity-30"
        style={{ background: "radial-gradient(circle at 20% 50%, var(--brand) 0%, transparent 50%)" }}
      />
      <div className="relative p-4 flex items-center gap-4">
        <div className="relative shrink-0">
          <div
            className="w-14 h-14 border-2 border-red-500 flex items-center justify-center clip-corner"
            style={{ background: "linear-gradient(135deg, #1a0000, #000)" }}
          >
            <Radio className="w-7 h-7 text-red-500" />
          </div>
          <span className="absolute -top-1 -end-1 flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="font-mono text-[10px] tracking-widest text-red-400 font-bold">
              {t("liveNow")}
            </span>
            {typeof live.viewers === "number" && (
              <span className="font-mono text-[10px] text-zinc-500">
                {t("watching", { count: fmt(live.viewers) })}
              </span>
            )}
          </div>
          <h2 className="font-display text-xl text-white truncate">{live.title || t("liveOnTwitch")}</h2>
          {live.game && <p className="text-xs text-zinc-400">🎮 {live.game}</p>}
        </div>
        <a
          href={live.watchUrl ?? channels[0]?.url ?? "#"}
          target="_blank"
          rel="noreferrer"
          className="hidden sm:flex shrink-0 items-center gap-2 px-4 py-2.5 bg-red-600 hover:bg-red-500 text-white font-bold text-xs uppercase tracking-wider transition-colors clip-tag"
        >
          <Eye className="w-3.5 h-3.5" /> {t("watch")}
        </a>
      </div>
    </div>
  );
}
