"use client";
// src/components/profile/ProfileClient.tsx
import { useState, useTransition, useEffect, type ComponentType, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { useTranslations, useLocale } from "next-intl";
import HowItWorks from "@/components/HowItWorks";
import {
  Trophy, Award, Link as LinkIcon, History, Loader2, Plus, X, Check,
  Globe, Music2, Flame, MessageCircle, Mic2,
  Copy, ShieldCheck, Heart, Star, Crown, Ban, LogOut,
  Gamepad2, Radio, MessageSquare, Code2, ChevronDown,
} from "lucide-react";
import { InstagramIcon, TwitterIcon, YoutubeIcon } from "@/components/BrandIcons";
import { formatDate, rankForLevel, xpForLevel, cn, displayNick, isPublicHandle } from "@/lib/utils";
import { useLocaleFmt } from "@/lib/use-locale-fmt";
import { MAX_LEVEL, LEVEL_CAP_XP, PRESTIGE_XP, prestigeGtMultiplier, shopDiscountFraction } from "@/lib/economy";

type Achievement = {
  id: string;
  code: string;
  name: string;
  description: string;
  icon: string;
  rarity: string;
  hidden: boolean;
  triggerType: string | null;
  triggerValue: number | null;
};

type Props = {
  user: {
    id: string;
    name: string | null;
    username: string | null;
    displayName: string | null;
    bio: string | null;
    image: string | null;
    tokens: number;
    totalEarned: number;
    totalSpent: number;
    level: number;
    xp: number;
    prestige: number;
    streak: number;
    messageCount: number;
    voiceMinutes: number;
    isAdmin: boolean;
    isModerator: boolean;
    isDonator: boolean;
    totalDonated: number;
    discordId: string | null;
    isBanned: boolean;
    bannedUntil: string | null;
    banReason: string | null;
    createdAt: string;
  };
  connections: Array<{
    id: string;
    platform: string;
    username: string;
    displayName: string | null;
    avatar: string | null;
    isSubscriber: boolean;
    subTier: string | null;
    subMonths: number;
    isModerator: boolean;
    isVip: boolean;
    followers: number | null;
    connectedAt: string;
  }>;
  earnedAchievements: Array<{
    id: string;
    earnedAt: string;
    achievement: Achievement;
  }>;
  allAchievements: Achievement[];
  socialLinks: Array<{
    id: string;
    platform: string;
    handle: string;
    url: string;
  }>;
  transactions: Array<{
    id: string;
    type: string;
    amount: number;
    reason: string;
    multiplier: number;
    status: string;
    note: string | null;
    createdAt: string;
    shopItem: { name: string; imageEmoji: string | null } | null;
  }>;
  linkedAccounts: Array<{
    provider: string;
    providerAccountId: string;
  }>;
  duelStats: { wins: number; losses: number };
};

const RARITY_STYLE: Record<string, { border: string; bg: string; text: string; label: string }> = {
  common:    { border: "border-zinc-700",    bg: "bg-zinc-900/40",   text: "text-zinc-300",   label: "rarityCommon" },
  rare:      { border: "border-blue-700",    bg: "bg-blue-950/30",   text: "text-blue-300",   label: "rarityRare" },
  epic:      { border: "border-purple-700",  bg: "bg-purple-950/30", text: "text-purple-300", label: "rarityEpic" },
  legendary: { border: "border-orange-600",  bg: "bg-orange-950/30", text: "text-orange-300", label: "rarityLegendary" },
};

// Manual social-link platforms (editable by user). `placeholder` is a "profile"
// namespace key (translated at render); labels are brand names (kept as-is).
const SOCIAL_META: Record<string, { label: string; icon: ComponentType<{ className?: string; style?: CSSProperties; strokeWidth?: number | string }>; color: string; placeholder: string }> = {
  instagram: { label: "Instagram", icon: InstagramIcon, color: "#E4405F", placeholder: "phHandle" },
  twitter:   { label: "X (Twitter)", icon: TwitterIcon, color: "#000",    placeholder: "phHandle" },
  tiktok:    { label: "TikTok",    icon: Music2,    color: "#fff",    placeholder: "phHandle" },
  youtube:   { label: "YouTube",   icon: YoutubeIcon,   color: "#FF0000", placeholder: "phYoutube" },
  rumble:    { label: "Rumble",    icon: Radio,     color: "#85c742", placeholder: "phChannel" },
  trovo:     { label: "Trovo",     icon: Radio,     color: "#19d66c", placeholder: "phNick" },
  github:    { label: "GitHub",    icon: Code2,     color: "#fafafa", placeholder: "phUser" },
  steam:     { label: "Steam",     icon: Gamepad2,  color: "#66c0f4", placeholder: "phVanity" },
  psn:       { label: "PlayStation", icon: Gamepad2, color: "#0070d1", placeholder: "phPsn" },
  xbox:      { label: "Xbox",      icon: Gamepad2,  color: "#107C10", placeholder: "phGamertag" },
  discord:   { label: "Discord", icon: MessageSquare, color: "#5865F2", placeholder: "phDiscord" },
  website:   { label: "Website",   icon: Globe,     color: "#10b981", placeholder: "phDomain" },
};

export function ProfileClient({
  user, connections, earnedAchievements, allAchievements, socialLinks, transactions, linkedAccounts, duelStats,
}: Props) {
  const t = useTranslations("profile");
  const locale = useLocale();
  const fmt = useLocaleFmt();
  const rank = rankForLevel(user.level);
  const duelTotal = duelStats.wins + duelStats.losses;
  const duelWinrate = duelTotal > 0 ? Math.round((duelStats.wins / duelTotal) * 100) : 0;
  const xpNeeded = xpForLevel(user.level + 1);
  const xpCurrent = user.xp % 500;
  // At the level cap, the XP bar tracks prestige progress (overflow XP past the cap)
  // instead of the cosmetic 0-499 cycle.
  const atMax = user.level >= MAX_LEVEL;
  const prestigeProgress = atMax ? Math.max(0, user.xp - LEVEL_CAP_XP) % PRESTIGE_XP : 0;
  const xpProgress = atMax
    ? Math.min(100, (prestigeProgress / PRESTIGE_XP) * 100)
    : Math.min(100, (xpCurrent / 500) * 100);
  const earnedIds = new Set(earnedAchievements.map((ua) => ua.achievement.id));
  // Map achievement code -> name so transaction reasons like "achievement:linked_2"
  // render as the real achievement name in the history.
  const achByCode = new Map(allAchievements.map((a) => [a.code, a.name] as const));

  const pendingDeliveries = transactions.filter(
    (t) => t.type === "spend" && t.status === "pending",
  );

  return (
    <div className="space-y-6">
      {/* Hero card */}
      <div
        className="relative border border-zinc-800 bg-zinc-950/80 backdrop-blur-xs p-6"
        style={{
          clipPath:
            "polygon(0 0, calc(100% - 16px) 0, 100% 16px, 100% 100%, 16px 100%, 0 calc(100% - 16px))",
        }}
      >
        <button
          onClick={() => signOut({ callbackUrl: "/" })}
          className="absolute top-3 end-4 z-10 flex items-center gap-1.5 px-2.5 py-1 border border-zinc-700 hover:border-red-500 text-zinc-400 hover:text-red-400 text-[10px] font-bold tracking-widest uppercase transition-all"
          title={t("logoutTitle")}
        >
          <LogOut className="w-3 h-3" /> {t("logout")}
        </button>
        <div className="flex flex-col md:flex-row gap-6 items-start">
          <div className="relative shrink-0">
            {user.image ? (
              <img
                src={user.image}
                alt={displayNick(user.displayName, user.username)}
                className="w-24 h-24 md:w-28 md:h-28 object-cover border-2"
                style={{ borderColor: rank.color }}
              />
            ) : (
              <img
                src="/brand/skull.png"
                alt=""
                className="w-24 h-24 md:w-28 md:h-28 object-cover border-2 bg-black"
                style={{ borderColor: rank.color }}
              />
            )}
            <div
              className="absolute -bottom-2 -end-2 px-2 py-0.5 text-[10px] font-bold tracking-widest uppercase"
              style={{ background: rank.color, color: "#000" }}
            >
              LVL {user.level}
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-baseline gap-2 mb-1">
              <h1
                className="font-display text-3xl md:text-4xl text-white tracking-wider"
                style={{ textShadow: "2px 0 0 rgba(229,9,20,0.6), -2px 0 0 rgba(139,0,0,0.4)" }}
              >
                {displayNick(user.displayName, user.username)}
              </h1>
              {user.isAdmin && (
                <span className="text-[10px] font-bold tracking-widest uppercase border border-red-500 bg-red-600/15 text-red-300 px-2 py-0.5 flex items-center gap-1">
                  <Crown className="w-2.5 h-2.5" /> ADMIN
                </span>
              )}
              {user.isModerator && !user.isAdmin && (
                <span className="text-[10px] font-bold tracking-widest uppercase border border-blue-500 bg-blue-600/15 text-blue-300 px-2 py-0.5 flex items-center gap-1">
                  <ShieldCheck className="w-2.5 h-2.5" /> MOD
                </span>
              )}
              {user.isDonator && (
                <span
                  className="text-[10px] font-bold tracking-widest uppercase border border-yellow-500 bg-yellow-600/15 text-yellow-300 px-2 py-0.5 flex items-center gap-1"
                  title={user.totalDonated > 0 ? t("donatorTitle", { amount: fmt(user.totalDonated) }) : t("donatorTitleFallback")}
                >
                  <Heart className="w-2.5 h-2.5" /> {t("badgeDonator")}
                </span>
              )}
              {user.isBanned && (
                <span
                  className="text-[10px] font-bold tracking-widest uppercase border-2 border-red-600 bg-red-950/60 text-red-300 px-2 py-0.5 flex items-center gap-1"
                  title={user.banReason ?? t("bannedTitleFallback")}
                >
                  <Ban className="w-2.5 h-2.5" /> BANNED
                  {user.bannedUntil && ` (${t("bannedUntil", { date: formatDate(user.bannedUntil, locale) })})`}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 text-zinc-500 font-mono text-xs mb-3 flex-wrap">
              <span>@{user.username ?? t("usernameUnset")}</span>
              <span>·</span>
              <span style={{ color: rank.color }}>
                {rank.emoji} {rank.name}
              </span>
              {user.prestige > 0 && (
                <span
                  className="text-[10px] font-bold tracking-widest uppercase border border-amber-600/60 bg-amber-950/30 text-amber-300 px-1.5 py-0.5"
                  title={t("prestigeTitle", { n: user.prestige })}
                >
                  ✦ {user.prestige}
                </span>
              )}
              <span>·</span>
              <span>{t("joined", { date: formatDate(user.createdAt, locale) })}</span>
            </div>

            {user.bio && (
              <p className="text-zinc-400 text-sm mb-4 italic">"{user.bio}"</p>
            )}

            {/* XP progress — tracks prestige once the level is maxed */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-widest">
                <span className="text-zinc-500">
                  {atMax ? t("xpToPrestige", { n: user.prestige + 1 }) : t("xpToLevel", { n: user.level + 1 })}
                </span>
                <span className="text-white">
                  {atMax ? `${fmt(prestigeProgress)} / ${fmt(PRESTIGE_XP)}` : `${fmt(xpCurrent)} / 500`}
                </span>
              </div>
              <div className="h-2 bg-zinc-900 border border-zinc-800 overflow-hidden">
                <div
                  className="h-full transition-all"
                  style={{
                    width: `${xpProgress}%`,
                    background: atMax
                      ? "linear-gradient(90deg, #f59e0b, #E50914)"
                      : `linear-gradient(90deg, ${rank.color}, #E50914)`,
                  }}
                />
              </div>
              <p className="text-[10px] text-zinc-600 font-mono">
                {atMax
                  ? t("xpTotalMax", { xp: fmt(user.xp) })
                  : t("xpTotal", { xp: fmt(user.xp), left: fmt(Math.max(0, xpForLevel(100) - user.xp)) })}
              </p>
              {(user.level > 1 || user.prestige > 0) && (
                <p className="text-[10px] font-mono text-emerald-400/90">
                  {t("perkChat", { pct: Math.round(Math.min(50, (user.level - 1) * 0.5)) })}
                  {user.prestige > 0 &&
                    t("perkPrestige", { n: user.prestige, pct: Math.round((prestigeGtMultiplier(user.prestige) - 1) * 100) })}
                  {shopDiscountFraction(user.level, user.prestige) > 0 &&
                    t("perkShop", { pct: Math.round(shopDiscountFraction(user.level, user.prestige) * 100) })}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      <HowItWorks>{t("help")}</HowItWorks>

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <StatTile label={t("statBalance")} value={fmt(user.tokens)} suffix="GT" emoji="👻" accent />
        <StatTile label={t("statEarned")} value={fmt(user.totalEarned)} suffix="GT" emoji="📈" />
        <StatTile label={t("statSpent")} value={fmt(user.totalSpent)} suffix="GT" emoji="💸" />
        <StatTile label={t("statStreak")} value={user.streak.toString()} suffix={t("streakUnit", { count: user.streak })} emoji="🔥" />
        <StatTile label={t("statMessages")} value={fmt(user.messageCount)} emoji="💬" />
        <StatTile label={t("statVoice")} value={fmt(user.voiceMinutes)} suffix="min" emoji="🎤" />
        {duelTotal > 0 && (
          <StatTile
            label={t("statDuels")}
            value={`${duelStats.wins}W·${duelStats.losses}L`}
            suffix={t("duelWr", { n: duelWinrate })}
            emoji="⚔️"
          />
        )}
      </div>

      {/* Pending deliveries */}
      {pendingDeliveries.length > 0 && (
        <SectionCard
          title={t("pendingTitle")}
          icon={Flame}
          accent="orange"
          subtitle={t("pendingSubtitle", { count: pendingDeliveries.length })}
        >
          <div className="space-y-2">
            {pendingDeliveries.map((tx) => (
              <div
                key={tx.id}
                className="flex items-center gap-3 border border-orange-900/50 bg-orange-950/20 px-3 py-2.5"
              >
                <span className="text-2xl">{tx.shopItem?.imageEmoji ?? "🎁"}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-white font-medium truncate">
                    {tx.shopItem?.name ?? prettyReason(tx.reason, t, achByCode)}
                  </div>
                  <div className="text-[10px] font-mono text-orange-400 uppercase tracking-widest">
                    {t("pendingStatus", { date: formatDate(tx.createdAt, locale) })}
                  </div>
                </div>
                <div className="text-xs font-mono text-zinc-500 hidden sm:block">
                  {t("pendingContact")}
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {/* Discord linking — only when not yet linked */}
      {!user.discordId && <DiscordLinkCard />}

      {/* Unified: OAuth accounts (link/unlink + sub/mod/vip status) + social links */}
      <SectionCard title={t("accountsTitle")} icon={LinkIcon}>
        <AccountsAndLinks connections={connections} linkedAccounts={linkedAccounts} socialLinks={socialLinks} />
      </SectionCard>

      {/* Achievements */}
      <SectionCard
        title={t("achievementsTitle")}
        icon={Trophy}
        subtitle={t("achievementsSubtitle", { earned: earnedAchievements.length, total: allAchievements.length })}
      >
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
          {allAchievements.map((a) => {
            const earned = earnedIds.has(a.id);
            const style = RARITY_STYLE[a.rarity] ?? RARITY_STYLE.common;
            return (
              <div
                key={a.id}
                className={cn(
                  "border p-3 flex flex-col items-center text-center transition-all",
                  earned ? `${style.border} ${style.bg}` : "border-zinc-900 bg-black/40 opacity-50",
                )}
                title={a.description}
              >
                <div className={cn("text-3xl mb-1.5", earned ? "" : "grayscale")}>{a.icon}</div>
                <div className={cn("text-[11px] font-bold leading-tight", earned ? style.text : "text-zinc-600")}>
                  {a.name}
                </div>
                <div className="text-[9px] font-mono uppercase tracking-widest text-zinc-600 mt-1">
                  {t(style.label)}
                </div>
              </div>
            );
          })}
        </div>
      </SectionCard>

      {/* Transaction history */}
      <SectionCard
        title={t("historyTitle")}
        icon={History}
        subtitle={t("historySubtitle", { count: transactions.length })}
      >
        {transactions.length === 0 ? (
          <p className="text-zinc-500 text-sm">{t("historyEmpty")}</p>
        ) : (
          <div className="divide-y divide-zinc-900">
            {transactions.map((tx) => {
              const isEarn = tx.amount > 0;
              return (
                <div key={tx.id} className="flex items-center gap-3 py-2.5">
                  <span className="text-xl shrink-0">
                    {tx.shopItem?.imageEmoji ?? (isEarn ? "📈" : "🛒")}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-white truncate">
                      {tx.shopItem?.name ?? prettyReason(tx.reason, t, achByCode)}
                    </div>
                    <div className="text-[10px] font-mono text-zinc-600 uppercase tracking-widest">
                      {formatDate(tx.createdAt, locale)}
                      {tx.multiplier && tx.multiplier !== 1 ? ` · ×${tx.multiplier}` : ""}
                      {tx.status !== "completed" ? ` · ${tx.status}` : ""}
                    </div>
                  </div>
                  <div
                    className={cn(
                      "font-mono font-bold text-sm tabular-nums",
                      isEarn ? "text-green-400" : "text-red-400",
                    )}
                  >
                    {isEarn ? "+" : ""}
                    {fmt(tx.amount)} GT
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

function StatTile({
  label, value, suffix, emoji, accent,
}: {
  label: string; value: string; suffix?: string; emoji: string; accent?: boolean;
}) {
  return (
    <div
      className={cn(
        "border bg-zinc-950/70 backdrop-blur-xs p-3",
        accent ? "border-red-900/50" : "border-zinc-800",
      )}
    >
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-base">{emoji}</span>
        <span className="text-[9px] font-mono uppercase tracking-widest text-zinc-500">
          {label}
        </span>
      </div>
      <div className="font-mono text-xl font-bold text-white tabular-nums">
        {value}
        {suffix && <span className="text-zinc-500 text-xs ms-1">{suffix}</span>}
      </div>
    </div>
  );
}

function SectionCard({
  title, icon: Icon, subtitle, accent, className, children,
}: {
  title: string;
  icon: typeof Trophy;
  subtitle?: string;
  accent?: "orange";
  className?: string;
  children: React.ReactNode;
}) {
  const borderColor = accent === "orange" ? "border-orange-900/50" : "border-zinc-800";
  return (
    <div
      className={cn("border bg-zinc-950/70 backdrop-blur-xs p-5", borderColor, className)}
      style={{
        clipPath:
          "polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 12px 100%, 0 calc(100% - 12px))",
      }}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-red-500" />
          <h2 className="font-display text-lg text-white tracking-wider">{title.toUpperCase()}</h2>
        </div>
        {subtitle && (
          <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">
            {subtitle}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

type Tile = {
  key: string;
  platform: string;
  label: string;
  color: string;
  handle: string;
  url: string;
  source: "auto" | "manual";
  Icon: React.ReactNode;
};

function SocialLinksEditor({
  initialLinks,
}: {
  initialLinks: Array<{ id: string; platform: string; handle: string; url: string }>;
}) {
  const t = useTranslations("profile");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [links, setLinks] = useState(initialLinks);
  const [open, setOpen] = useState<string | null>(null); // rozwinięta platforma (klucz karty)
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const manualPlatforms = Object.keys(SOCIAL_META);

  async function save(platform: string) {
    if (!draft.trim()) return;
    setBusy(platform);
    try {
      const res = await fetch("/api/profile/social-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform, handle: draft }),
      });
      const data = await res.json();
      if (res.ok && data.link) {
        setLinks((prev) => {
          const others = prev.filter((l) => l.platform !== platform);
          return [...others, data.link].sort((a, b) => a.platform.localeCompare(b.platform));
        });
        setOpen(null);
        setDraft("");
        startTransition(() => router.refresh());
      }
    } finally {
      setBusy(null);
    }
  }

  async function remove(platform: string) {
    setBusy(platform);
    try {
      const res = await fetch(`/api/profile/social-links?platform=${platform}`, { method: "DELETE" });
      if (res.ok) {
        setLinks((prev) => prev.filter((l) => l.platform !== platform));
        setOpen(null);
        startTransition(() => router.refresh());
      }
    } finally {
      setBusy(null);
    }
  }

  // Rozwijana karta per platforma (klik nagłówek → edycja). Spójne z kartami integracji.
  return (
    <div className="space-y-2">
      <p className="text-zinc-500 text-xs mb-1">
        {t("socialIntro")}
      </p>

      {/* Manual platforms (editable) */}
      {manualPlatforms.map((platform) => {
        const meta = SOCIAL_META[platform];
        const Icon = meta.icon;
        const existing = links.find((l) => l.platform === platform);
        const key = `manual-${platform}`;
        const isOpen = open === key;
        const isBusy = busy === platform || pending;
        return (
          <div key={key} className={cn("border bg-black/30", existing ? "border-zinc-800" : "border-zinc-900")}>
            <button
              type="button"
              onClick={() => {
                const next = isOpen ? null : key;
                setOpen(next);
                setDraft(next ? (existing?.handle ?? "") : "");
              }}
              aria-expanded={isOpen}
              className="w-full flex items-center gap-3 p-3 text-start hover:bg-white/[0.03] transition-colors"
            >
              <Icon className="w-5 h-5 shrink-0" style={{ color: meta.color }} strokeWidth={2} />
              <span className="text-[11px] font-mono uppercase tracking-widest text-zinc-300 flex-1">{meta.label}</span>
              {existing ? (
                <span className="flex items-center gap-1.5 text-xs text-green-500 font-mono shrink-0 truncate max-w-[45%]">
                  <Check className="w-3.5 h-3.5 shrink-0" /> @{existing.handle}
                </span>
              ) : (
                <span className="text-xs text-zinc-600 shrink-0">{t("socialNone")}</span>
              )}
              <ChevronDown className={cn("w-4 h-4 text-zinc-500 shrink-0 transition-transform", isOpen && "rotate-180")} />
            </button>
            {isOpen && (
              <div className="p-3 pt-0 space-y-2">
                <div className="flex items-center gap-2">
                  <Icon className="w-4 h-4 shrink-0" style={{ color: meta.color }} />
                  <input
                    autoFocus
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") save(platform);
                      if (e.key === "Escape") { setOpen(null); setDraft(""); }
                    }}
                    placeholder={t(meta.placeholder)}
                    className="flex-1 bg-black border border-zinc-800 px-2 py-1.5 text-xs text-white outline-hidden font-mono min-w-0 focus:border-red-600"
                  />
                  <button onClick={() => save(platform)} disabled={isBusy || !draft.trim()} className="text-green-400 hover:text-green-300 disabled:opacity-30" title={t("save")}>
                    {isBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  </button>
                  {existing && (
                    <button onClick={() => remove(platform)} disabled={isBusy} className="text-red-500 hover:text-red-400 disabled:opacity-30" title={t("remove")}>
                      {isBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
                    </button>
                  )}
                </div>
                {existing && (
                  <a href={existing.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-white break-all">
                    <LinkIcon className="w-3 h-3 shrink-0" /> {existing.url}
                  </a>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function DiscordLinkCard() {
  const t = useTranslations("profile");
  const [code, setCode] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function generate() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/profile/discord-link-code", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setErr(data.error ?? t("discordErrGeneric"));
      } else {
        setCode(data.code);
        setExpiresAt(data.expiresAt);
      }
    } catch {
      setErr(t("discordErrConn"));
    } finally {
      setBusy(false);
    }
  }

  function copyCode() {
    if (!code) return;
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div
      className="border-2 border-indigo-700 bg-linear-to-br from-indigo-950/40 to-purple-950/20 backdrop-blur-xs p-5"
      style={{
        clipPath:
          "polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 12px 100%, 0 calc(100% - 12px))",
      }}
    >
      <div className="flex items-start gap-4">
        <div className="text-4xl shrink-0">👾</div>
        <div className="flex-1">
          <h3 className="font-display text-lg text-white tracking-wider mb-1">
            {t("discordTitle")}
          </h3>
          <p className="text-zinc-400 text-xs leading-relaxed mb-4">
            {t.rich("discordIntro", {
              code: (chunks) => (
                <code className="bg-black/40 px-1.5 py-0.5 text-indigo-300 font-mono">{chunks}</code>
              ),
            })}
          </p>

          {!code ? (
            <button
              onClick={generate}
              disabled={busy}
              className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold tracking-widest uppercase transition-all disabled:opacity-50 flex items-center gap-2"
            >
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LinkIcon className="w-3.5 h-3.5" />}
              {t("discordGenerate")}
            </button>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-black/60 border-2 border-indigo-500 px-4 py-3 text-2xl text-white font-mono tracking-[0.3em] text-center select-all">
                  {code}
                </code>
                <button
                  onClick={copyCode}
                  className="px-3 py-3 border-2 border-indigo-700 hover:border-indigo-500 text-indigo-300 flex items-center justify-center"
                  title={t("discordCopyTitle")}
                >
                  {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
              <div className="text-[10px] font-mono uppercase tracking-widest text-indigo-400 flex items-center justify-between">
                <span>{t("discordStep1")}</span>
                <span>{t("discordStep2", { code })}</span>
              </div>
              <p className="text-[10px] text-zinc-500">
                {t("discordExpiry")}
              </p>
            </div>
          )}

          {err && (
            <div className="mt-3 border border-red-700 bg-red-950/40 px-3 py-2 text-red-200 text-xs">
              {err}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// `t` is the "profile" translator passed from the calling component (module-scope
// fn can't call the hook itself); typed loosely to avoid next-intl key-narrowing.
function prettyReason(reason: string, t: any, achByCode?: Map<string, string>): string {
  const exact: Record<string, string> = {
    welcome_bonus: t("reasonWelcome"),
    message: t("reasonMessage"),
    voice: t("reasonVoice"),
    kick_follow: t("reasonKickFollow"),
    kick_sub: t("reasonKickSub"),
  };
  if (exact[reason]) return exact[reason];

  const colon = reason.indexOf(":");
  const key = colon === -1 ? reason : reason.slice(0, colon);
  const rest = colon === -1 ? "" : reason.slice(colon + 1);

  switch (key) {
    case "achievement":       return achByCode?.get(rest) ? t("reasonAchievement", { name: achByCode.get(rest) }) : t("reasonAchievementBare");
    case "daily_task":        return t("reasonDailyTask");
    case "shop":              return rest || t("reasonShop");
    case "season":            return t("reasonSeason");
    case "donation":          return t("reasonDonation");
    case "drop":              return rest.endsWith("_bonus") ? t("reasonDropBonus") : t("reasonDrop");
    case "raffle_tickets":    return rest ? t("reasonRaffleTickets", { rest }) : t("reasonRaffleBare");
    case "twitch_sub":        return t("reasonTwitchSub");
    case "twitch_gift_sub":   return t("reasonTwitchGiftSub");
    case "twitch_cheer":      return t("reasonTwitchCheer");
    case "kick_gift_sub":     return t("reasonKickGiftSub");
    case "yt_superchat":      return t("reasonYtSuperchat");
    case "yt_member":         return t("reasonYtMember");
    case "paymedia":          return t("reasonPaymedia");
    case "prediction_wager":  return t("reasonPredWager");
    case "prediction_win":    return t("reasonPredWin");
    case "prediction_refund": return t("reasonPredRefund");
    case "prediction_cancel": return t("reasonPredCancel");
    case "refund":            return t("reasonRefund", { inner: prettyReason(rest, t, achByCode) });
    default:                  return key.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
  }
}

// ============== ACCOUNTS & LINKS (OAuth link/unlink + status + social links) ==============

type AccountProvider = {
  id: string;            // NextAuth provider id (twitch | kick | discord | google)
  connPlatform: string;  // Connection.platform key (google → youtube)
  label: string;
  color: string;
  emoji: string;
  description: string;   // "profile" namespace key (translated at render)
};

const ACCOUNT_PROVIDERS: AccountProvider[] = [
  { id: "twitch",  connPlatform: "twitch",  label: "Twitch",  color: "#9146FF", emoji: "💜", description: "provTwitch" },
  { id: "kick",    connPlatform: "kick",    label: "Kick",    color: "#53FC18", emoji: "🟢", description: "provKick" },
  { id: "discord", connPlatform: "discord", label: "Discord", color: "#5865F2", emoji: "👾", description: "provDiscord" },
  { id: "google",  connPlatform: "youtube", label: "YouTube", color: "#FF0000", emoji: "📺", description: "provYoutube" },
];

// Maps the OAuth round-trip error code to a "profile" namespace key.
const LINK_ERROR_KEY: Record<string, string> = {
  target_missing:          "errTargetMissing",
  already_used_by_another: "errAlreadyUsed",
  already_have_provider:   "errAlreadyHave",
  internal:                "errInternal",
};

type ProfileConnection = Props["connections"][number];

// One unified section: link/unlink OAuth platforms (with their sub/mod/VIP status
// shown inline on each tile) + the manual social links — replaces the previous
// three separate cards (Połączone konta / Social linki / Połączone platformy).
function AccountsAndLinks({
  connections, linkedAccounts, socialLinks,
}: {
  connections: ProfileConnection[];
  linkedAccounts: Array<{ provider: string; providerAccountId: string }>;
  socialLinks: Array<{ id: string; platform: string; handle: string; url: string }>;
}) {
  const t = useTranslations("profile");
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);

  // Pick up query-param flash messages from the OAuth round-trip
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const linked = params.get("linked");
    const err = params.get("link_error");
    if (linked) {
      const meta = ACCOUNT_PROVIDERS.find((p) => p.id === linked);
      setFlash({ kind: "ok", msg: t("linkedFlash", { label: meta?.label ?? linked }) });
    } else if (err) {
      setFlash({ kind: "err", msg: t(LINK_ERROR_KEY[err] ?? "linkFailGeneric") });
    }
    if (linked || err) {
      const url = new URL(window.location.href);
      url.searchParams.delete("linked");
      url.searchParams.delete("link_error");
      window.history.replaceState(null, "", url.toString());
      const t = setTimeout(() => setFlash(null), 6000);
      return () => clearTimeout(t);
    }
  }, [t]);

  const linkedProviders = new Set(linkedAccounts.map((a) => a.provider));
  const onlyOneMethod = linkedAccounts.length <= 1;
  const connByPlatform = new Map(connections.map((c) => [c.platform, c] as const));

  function startLink(providerId: string) {
    window.location.href = `/api/profile/connections/link/${providerId}`;
  }

  async function unlink(providerId: string) {
    const meta = ACCOUNT_PROVIDERS.find((p) => p.id === providerId);
    if (!confirm(t("unlinkConfirm", { label: meta?.label ?? providerId }))) return;
    setBusy(providerId);
    try {
      const res = await fetch("/api/profile/connections/unlink", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: providerId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFlash({ kind: "err", msg: data.error ?? t("unlinkFailGeneric") });
      } else {
        setFlash({ kind: "ok", msg: t("unlinkedFlash", { label: meta?.label ?? providerId }) });
        router.refresh();
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      {flash && (
        <div
          className={cn(
            "px-3 py-2 border text-xs",
            flash.kind === "ok"
              ? "border-green-700 bg-green-950/40 text-green-200"
              : "border-red-700 bg-red-950/40 text-red-200",
          )}
        >
          {flash.msg}
        </div>
      )}

      {/* Block 1 — OAuth accounts: link/unlink + sub/mod/VIP status on each tile */}
      <div>
        <h3 className="text-[11px] font-mono uppercase tracking-widest text-zinc-400 mb-1">{t("accountsBlockTitle")}</h3>
        <p className="text-zinc-500 text-xs mb-3">
          {t("accountsBlockIntro")}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {ACCOUNT_PROVIDERS.map((p) => {
            const isLinked = linkedProviders.has(p.id);
            const isBusy = busy === p.id;
            const conn = connByPlatform.get(p.connPlatform);
            const handle = conn && isPublicHandle(conn.username) ? conn.username : null;
            return (
              <div
                key={p.id}
                className={cn(
                  "border p-3 flex items-stretch gap-3",
                  isLinked ? "border-zinc-700 bg-black/30" : "border-zinc-900 bg-black/20",
                )}
              >
                <div className="w-2 shrink-0" style={{ background: isLinked ? p.color : "#333" }} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                    <span className="text-base">{p.emoji}</span>
                    <span className="font-bold text-sm text-white">{p.label}</span>
                    {isLinked ? (
                      <span className="text-[9px] font-mono uppercase tracking-widest px-1.5 py-0.5 border border-green-700 bg-green-950/30 text-green-300">
                        {t("connected")}
                      </span>
                    ) : (
                      <span className="text-[9px] font-mono uppercase tracking-widest px-1.5 py-0.5 border border-zinc-800 text-zinc-500">
                        {t("notConnected")}
                      </span>
                    )}
                  </div>
                  {/* Inline status (from the OAuth Connection): handle + sub/mod/VIP */}
                  {isLinked && (handle || conn?.isModerator || conn?.isVip || conn?.isSubscriber) && (
                    <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                      {handle && <span className="text-xs text-zinc-400 font-mono truncate max-w-[60%]">@{handle}</span>}
                      {conn?.isModerator && (
                        <span className="text-[9px] font-bold tracking-widest uppercase px-1.5 py-0.5 flex items-center gap-1" style={{ background: "rgba(59,130,246,0.2)", color: "#60a5fa", border: "1px solid rgba(59,130,246,0.5)" }}>
                          <ShieldCheck className="w-2.5 h-2.5" /> MOD
                        </span>
                      )}
                      {conn?.isVip && (
                        <span className="text-[9px] font-bold tracking-widest uppercase px-1.5 py-0.5 flex items-center gap-1" style={{ background: "rgba(236,72,153,0.2)", color: "#f472b6", border: "1px solid rgba(236,72,153,0.5)" }}>
                          <Star className="w-2.5 h-2.5" /> VIP
                        </span>
                      )}
                      {conn?.isSubscriber && (
                        <span className="text-[9px] font-bold tracking-widest uppercase px-2 py-0.5" style={{ background: p.color + "30", color: p.color, border: `1px solid ${p.color}` }}>
                          {t("subBadge", { tier: conn.subTier ?? "?", months: conn.subMonths })}
                        </span>
                      )}
                    </div>
                  )}
                  <div className="text-[11px] text-zinc-500 truncate">{t(p.description)}</div>
                </div>
                <div className="shrink-0 flex items-center">
                  {isLinked ? (
                    <button
                      onClick={() => unlink(p.id)}
                      disabled={isBusy || onlyOneMethod}
                      title={onlyOneMethod ? t("unlinkOnlyMethodTitle") : t("unlink")}
                      className="text-[10px] font-mono uppercase tracking-widest border border-red-900 hover:border-red-700 hover:bg-red-950/40 text-red-400 hover:text-red-300 px-2.5 py-1.5 disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
                    >
                      {isBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
                      {t("unlink")}
                    </button>
                  ) : (
                    <button
                      onClick={() => startLink(p.id)}
                      disabled={isBusy}
                      className="text-[10px] font-mono uppercase tracking-widest border border-zinc-700 hover:border-red-700 hover:bg-red-950/40 text-zinc-300 hover:text-white px-2.5 py-1.5 transition-colors flex items-center gap-1.5"
                    >
                      <Plus className="w-3 h-3" />
                      {t("link")}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {onlyOneMethod && (
          <p className="text-[10px] text-zinc-600 mt-3 italic">
            {t("onlyMethodNote")}
          </p>
        )}
      </div>

      {/* Block 2 — manual social links (public handles shown on your profile) */}
      <div className="border-t border-zinc-900 pt-5">
        <h3 className="text-[11px] font-mono uppercase tracking-widest text-zinc-400 mb-2 flex items-center gap-1.5">
          <Globe className="w-3.5 h-3.5" /> {t("socialBlockTitle")}
        </h3>
        <SocialLinksEditor initialLinks={socialLinks} />
      </div>
    </div>
  );
}
