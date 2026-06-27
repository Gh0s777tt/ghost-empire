// src/app/u/[username]/page.tsx
// Public profile — visible to anyone (no auth required). Shows only public stats.
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { getTranslations, getLocale } from "next-intl/server";
import { localeAlternates } from "@/i18n/metadata";
import QRCode from "qrcode";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unstable_cache } from "next/cache";
import { Header } from "@/components/Header";
import { ProfileShareRow } from "@/components/profile/ProfileShareRow";
import { GiftButton } from "@/components/profile/GiftButton";
import { TrackedLink } from "@/components/profile/TrackedLink";
import {
  Trophy, Award, Link as LinkIcon, Globe, MessageCircle, Mic2, Flame,
  ShieldCheck, Heart, Crown, Ban, Star, Music2, Users, Send,
} from "lucide-react";
import type { ComponentType, CSSProperties } from "react";
import { InstagramIcon, TwitterIcon, YoutubeIcon } from "@/components/BrandIcons";
import { Link } from "@/i18n/navigation";
import { fmt, formatDate, rankForLevel, xpForLevel, cn, displayNick } from "@/lib/utils";
import { countryFlag } from "@/lib/countries";
import { accentColor } from "@/lib/profile-accents";
import { MAX_LEVEL, LEVEL_CAP_XP, PRESTIGE_XP } from "@/lib/economy";
import { companionStage } from "@/lib/companion";

export const dynamic = "force-dynamic";

const RARITY_STYLE: Record<string, { border: string; bg: string; text: string }> = {
  common:    { border: "border-zinc-700",   bg: "bg-zinc-900/40",   text: "text-zinc-300" },
  rare:      { border: "border-blue-700",   bg: "bg-blue-950/30",   text: "text-blue-300" },
  epic:      { border: "border-purple-700", bg: "bg-purple-950/30", text: "text-purple-300" },
  legendary: { border: "border-orange-600", bg: "bg-orange-950/30", text: "text-orange-300" },
};

const PLATFORM_META: Record<string, { label: string; color: string; emoji: string }> = {
  twitch:  { label: "Twitch",  color: "#9146FF", emoji: "💜" },
  discord: { label: "Discord", color: "#5865F2", emoji: "👾" },
  kick:    { label: "Kick",    color: "#53FC18", emoji: "🟢" },
  youtube: { label: "YouTube", color: "#FF0000", emoji: "📺" },
};

const SOCIAL_ICONS: Record<string, ComponentType<{ className?: string; style?: CSSProperties; strokeWidth?: number | string }>> = {
  instagram: InstagramIcon,
  twitter:   TwitterIcon,
  tiktok:    Music2,
  youtube:   YoutubeIcon,
  telegram:  Send,
  website:   Globe,
};

const SOCIAL_COLORS: Record<string, string> = {
  instagram: "#E4405F",
  twitter:   "#000",
  tiktok:    "#FE2C55",
  youtube:   "#FF0000",
  telegram:  "#26A5E4",
  website:   "#10b981",
};

// QR for the profile URL — generated server-side so the client ships no QR lib.
async function toQr(data: string): Promise<string | null> {
  try {
    return await QRCode.toDataURL(data, { margin: 1, width: 320, color: { dark: "#0a0a0a", light: "#ffffff" } });
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string; locale: string }>;
}) {
  const { username, locale } = await params;
  const t = await getTranslations({ locale, namespace: "userProfile" });
  const user = await prisma.user.findUnique({
    where: { username },
    select: { displayName: true, username: true, bio: true },
  });
  if (!user) return { title: t("notFound") };
  const name = displayNick(user.displayName, user.username);
  return {
    title: name,
    description: user.bio ?? t("metaDesc", { name }),
    alternates: localeAlternates(`/u/${username}`, locale),
  };
}

export default async function PublicProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const t = await getTranslations("userProfile");
  const locale = await getLocale();
  const session = await auth();
  const isOwnProfile = session?.user?.username === username;

  // Absolute profile URL for the share buttons (host from the proxy headers).
  const h = await headers();
  const host = h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? "https";
  const profileUrl = host ? `${proto}://${host}/u/${username}` : "";
  const profileQr = profileUrl ? await toQr(profileUrl) : null;

  const user = await prisma.user.findUnique({
    where: { username },
    select: {
      id: true,
      username: true,
      displayName: true,
      image: true,
      bio: true,
      country: true,
      profileAccent: true,
      tenantId: true, // per-portal rank scope (not exposed to the client)
      // Public stats only
      level: true,
      xp: true,
      prestige: true,
      totalEarned: true,
      streak: true,
      messageCount: true,
      voiceMinutes: true,
      isAdmin: true,
      isModerator: true,
      isDonator: true,
      isBanned: true,
      bannedUntil: true,
      createdAt: true,
      clanRole: true,
      companion: { select: { xp: true } },
      clan: { select: { id: true, tag: true, name: true } },
      // PRIVATE — NOT exposed: tokens (balance), totalSpent, email, modNote, banReason
    },
  });

  if (!user) notFound();

  const [connections, earnedAchievements, socialLinks, rankPositions, clanWarWins] = await Promise.all([
    prisma.connection.findMany({
      where: { userId: user.id },
      select: {
        platform: true,
        username: true,
        isSubscriber: true,
        subTier: true,
        subMonths: true,
        isModerator: true,
        isVip: true,
        isOG: true,
      },
    }),
    prisma.userAchievement.findMany({
      where: { userId: user.id },
      include: {
        achievement: {
          select: { id: true, code: true, name: true, icon: true, rarity: true, description: true },
        },
      },
      orderBy: { earnedAt: "desc" },
    }),
    prisma.socialLink.findMany({
      where: { userId: user.id },
      orderBy: { platform: "asc" },
    }),
    // Ranking positions — cached 120s. These three full-table COUNTs are the
    // heaviest part of this public, uncached (force-dynamic) page, and a rank barely
    // moves minute to minute. Keyed by the exact stat values so a different
    // user/stat-combo can never read a stale rank. (P1)
    unstable_cache(
      () =>
        Promise.all([
          prisma.user.count({ where: { tenantId: user.tenantId, totalEarned: { gt: user.totalEarned } } }),
          prisma.user.count({
            where: {
              tenantId: user.tenantId,
              OR: [
                { level: { gt: user.level } },
                { level: user.level, xp: { gt: user.xp } },
              ],
            },
          }),
          prisma.user.count({ where: { tenantId: user.tenantId, streak: { gt: user.streak } } }),
        ]),
      ["profile-rank", user.tenantId ?? "global", String(user.totalEarned), String(user.level), String(user.xp), String(user.streak)],
      { revalidate: 120 },
    )(),
    // Clan war trophies — how many wars this user's clan has won (0 if clanless).
    user.clan ? prisma.clanWar.count({ where: { winnerClanId: user.clan.id, status: "ended" } }) : Promise.resolve(0),
  ]);

  const [aheadByEarned, aheadByLevel, aheadByStreak] = rankPositions;
  const rankInfo = rankForLevel(user.level);
  const xpCurrent = user.xp % 500;
  const atMax = user.level >= MAX_LEVEL;
  // Self-chosen profile accent (#546) — tints the avatar ring + name glow; null = rank color.
  const accent = accentColor(user.profileAccent);
  const prestigeProgress = atMax ? Math.max(0, user.xp - LEVEL_CAP_XP) % PRESTIGE_XP : 0;
  const xpProgress = atMax
    ? Math.min(100, (prestigeProgress / PRESTIGE_XP) * 100)
    : Math.min(100, (xpCurrent / 500) * 100);

  return (
    <div className="min-h-screen bg-black">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute top-0 right-1/4 w-[600px] h-[600px] rounded-full blur-[150px] opacity-15"
          style={{ background: `radial-gradient(circle, ${rankInfo.color} 0%, transparent 70%)` }}
        />
      </div>

      <Header />

      <main className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pb-24 pt-6">
        <div className="space-y-6">
          {/* Hero card */}
          <div
            className="border border-zinc-800 bg-zinc-950/80 backdrop-blur-xs p-6"
            style={{
              clipPath:
                "polygon(0 0, calc(100% - 16px) 0, 100% 16px, 100% 100%, 16px 100%, 0 calc(100% - 16px))",
            }}
          >
            <div className="flex flex-col md:flex-row gap-6 items-start">
              <div className="relative shrink-0">
                {user.image ? (
                  <img
                    src={user.image}
                    alt={displayNick(user.displayName, user.username)}
                    className="w-24 h-24 md:w-32 md:h-32 object-cover border-2"
                    style={{ borderColor: accent ?? rankInfo.color }}
                  />
                ) : (
                  <img
                    src="/brand/skull.png"
                    alt=""
                    className="w-24 h-24 md:w-32 md:h-32 object-cover border-2 bg-black"
                    style={{ borderColor: accent ?? rankInfo.color }}
                  />
                )}
                <div
                  className="absolute -bottom-2 -end-2 px-2 py-0.5 text-[10px] font-bold tracking-widest uppercase"
                  style={{ background: rankInfo.color, color: "#000" }}
                >
                  LVL {user.level}
                </div>
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-baseline gap-2 mb-1">
                  <h1
                    className="font-display text-3xl md:text-4xl text-white tracking-wider"
                    style={{ textShadow: accent ? `2px 0 0 ${accent}, -2px 0 0 ${accent}66` : `2px 0 0 ${rankInfo.color}88, -2px 0 0 rgba(139,0,0,0.4)` }}
                  >
                    {displayNick(user.displayName, user.username)}
                  </h1>
                  {countryFlag(user.country) && (
                    <span className="text-2xl leading-none" title={user.country ?? ""} aria-label={user.country ?? ""}>{countryFlag(user.country)}</span>
                  )}
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
                    <span className="text-[10px] font-bold tracking-widest uppercase border border-yellow-500 bg-yellow-600/15 text-yellow-300 px-2 py-0.5 flex items-center gap-1">
                      <Heart className="w-2.5 h-2.5" /> DONATOR
                    </span>
                  )}
                  {user.isBanned && (
                    <span className="text-[10px] font-bold tracking-widest uppercase border-2 border-red-600 bg-red-950/60 text-red-300 px-2 py-0.5 flex items-center gap-1">
                      <Ban className="w-2.5 h-2.5" /> BANNED
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 text-zinc-500 font-mono text-xs mb-3 flex-wrap">
                  <span>@{user.username}</span>
                  <span>·</span>
                  <span style={{ color: rankInfo.color }}>
                    {rankInfo.emoji} {rankInfo.name}
                  </span>
                  {user.prestige > 0 && (
                    <span
                      className="text-[10px] font-bold tracking-widest uppercase border border-amber-600/60 bg-amber-950/30 text-amber-300 px-1.5 py-0.5"
                      title={t("prestigeTooltip", { n: user.prestige })}
                    >
                      ✦ {user.prestige}
                    </span>
                  )}
                  <span>·</span>
                  <span>{t("since", { date: formatDate(user.createdAt, locale) })}</span>
                </div>
                {user.bio && (
                  <p className="text-zinc-400 text-sm mb-4 italic">"{user.bio}"</p>
                )}

                {profileUrl && (
                  <div className="mb-4 flex items-center gap-2 flex-wrap">
                    <ProfileShareRow url={profileUrl} name={displayNick(user.displayName, user.username)} qr={profileQr} handle={user.username} />
                    {session?.user && !isOwnProfile && user.username && <GiftButton toUsername={user.username} />}
                  </div>
                )}

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-widest">
                    <span className="text-zinc-500">
                      {atMax ? t("xpToPrestige", { n: user.prestige + 1 }) : t("xpToLevel", { n: user.level + 1 })}
                    </span>
                    <span className="text-white">
                      {atMax ? `${fmt(prestigeProgress, locale)} / ${fmt(PRESTIGE_XP, locale)}` : `${fmt(xpCurrent, locale)} / 500`}
                    </span>
                  </div>
                  <div className="h-2 bg-zinc-900 border border-zinc-800 overflow-hidden">
                    <div
                      className="h-full transition-all"
                      style={{
                        width: `${xpProgress}%`,
                        background: atMax
                          ? "linear-gradient(90deg, #f59e0b, #E50914)"
                          : `linear-gradient(90deg, ${rankInfo.color}, #E50914)`,
                      }}
                    />
                  </div>
                  <p className="text-[10px] text-zinc-600 font-mono">
                    {atMax
                      ? t("xpTotalMax", { xp: fmt(user.xp, locale) })
                      : t("xpTotal", { xp: fmt(user.xp, locale), max: fmt(xpForLevel(100), locale) })}
                  </p>
                </div>
              </div>

              {isOwnProfile && (
                <Link
                  href="/profile"
                  className="px-3 py-2 border border-red-700 hover:border-red-500 text-red-400 hover:text-red-300 text-[10px] font-bold tracking-widest uppercase shrink-0"
                >
                  {t("ownPanel")}
                </Link>
              )}
            </div>
          </div>

          {/* Public stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatTile label={t("statLifetime")} value={fmt(user.totalEarned, locale)} emoji="📈" />
            <StatTile label={t("statStreak")} value={`${user.streak} ${t("streakUnit", { count: user.streak })}`} emoji="🔥" />
            <StatTile label={t("statMessages")} value={fmt(user.messageCount, locale)} emoji="💬" />
            <StatTile label={t("statVoice")} value={`${fmt(user.voiceMinutes, locale)} min`} emoji="🎤" />
            {user.companion && user.companion.xp > 0 && (
              <StatTile label={t("statCompanion")} value={`${fmt(user.companion.xp, locale)} XP`} emoji={companionStage(user.companion.xp).emoji} />
            )}
          </div>

          {/* Ranking positions */}
          <div
            className="border border-zinc-800 bg-zinc-950/70 backdrop-blur-xs p-4"
            style={{
              clipPath:
                "polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 12px 100%, 0 calc(100% - 12px))",
            }}
          >
            <div className="flex items-center gap-2 mb-3">
              <Trophy className="w-4 h-4 text-red-500" />
              <h2 className="font-display text-base text-white tracking-wider">{t("rankingPosition")}</h2>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <RankPosition label={t("statLifetime")} position={aheadByEarned + 1} hrefSort="totalEarned" />
              <RankPosition label={t("rankLevel")} position={aheadByLevel + 1} hrefSort="level" />
              <RankPosition label={t("statStreak")} position={aheadByStreak + 1} hrefSort="streak" />
            </div>
          </div>

          {/* Clan — tag, name, role and the clan's war trophies */}
          {user.clan && (
            <div
              className="border border-zinc-800 bg-zinc-950/70 backdrop-blur-xs p-4"
              style={{
                clipPath:
                  "polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 12px 100%, 0 calc(100% - 12px))",
              }}
            >
              <div className="flex items-center gap-2 mb-3">
                <Users className="w-4 h-4 text-red-500" />
                <h2 className="font-display text-base text-white tracking-wider">{t("clanTitle")}</h2>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <span className="px-2 py-0.5 rounded bg-white/5 text-sm font-mono font-bold" style={{ color: "var(--brand)" }}>[{user.clan.tag}]</span>
                <span className="text-white font-bold truncate">{user.clan.name}</span>
                {user.clanRole === "owner" && (
                  <span className="text-[10px] font-bold tracking-widest uppercase border border-amber-600/60 bg-amber-950/30 text-amber-300 px-1.5 py-0.5 inline-flex items-center gap-1">
                    <Crown className="w-2.5 h-2.5" /> {t("clanOwner")}
                  </span>
                )}
                {clanWarWins > 0 && (
                  <span className="inline-flex items-center gap-1.5 text-sm text-amber-300" title={t("clanWarWinsTitle")}>
                    <Trophy className="w-4 h-4" /> {t("clanWarWins", { count: clanWarWins })}
                  </span>
                )}
                <Link href="/clans" className="ms-auto text-[10px] font-mono uppercase tracking-widest text-zinc-500 hover:text-red-400">
                  {t("clanView")}
                </Link>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Connections */}
            <div
              className="lg:col-span-1 border border-zinc-800 bg-zinc-950/70 backdrop-blur-xs p-4"
              style={{
                clipPath:
                  "polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 12px 100%, 0 calc(100% - 12px))",
              }}
            >
              <div className="flex items-center gap-2 mb-3">
                <LinkIcon className="w-4 h-4 text-red-500" />
                <h2 className="font-display text-base text-white tracking-wider">{t("platforms")}</h2>
              </div>
              {connections.length === 0 ? (
                <p className="text-zinc-500 text-sm">{t("noConnections")}</p>
              ) : (
                <div className="space-y-2">
                  {connections.map((c) => {
                    const meta = PLATFORM_META[c.platform] ?? { label: c.platform, color: "#888", emoji: "🔗" };
                    return (
                      <div key={c.platform} className="border border-zinc-800 bg-black/30 p-2.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-lg">{meta.emoji}</span>
                          <span className="font-bold text-white text-sm">{meta.label}</span>
                          <div className="ml-auto flex items-center gap-1 flex-wrap">
                            {c.isOG && (
                              <span className="text-[9px] font-bold tracking-widest uppercase px-1.5 py-0.5 border border-amber-700 bg-amber-950/30 text-amber-300">
                                OG
                              </span>
                            )}
                            {c.isModerator && (
                              <span className="text-[9px] font-bold tracking-widest uppercase px-1.5 py-0.5 border border-blue-700 bg-blue-950/30 text-blue-300 flex items-center gap-1">
                                <ShieldCheck className="w-2.5 h-2.5" /> MOD
                              </span>
                            )}
                            {c.isVip && (
                              <span className="text-[9px] font-bold tracking-widest uppercase px-1.5 py-0.5 border border-pink-700 bg-pink-950/30 text-pink-300 flex items-center gap-1">
                                <Star className="w-2.5 h-2.5" /> VIP
                              </span>
                            )}
                            {c.isSubscriber && (
                              <span
                                className="text-[9px] font-bold tracking-widest uppercase px-1.5 py-0.5"
                                style={{ background: meta.color + "30", color: meta.color, border: `1px solid ${meta.color}` }}
                              >
                                {t("subLabel", { tier: c.subTier ?? "?", months: c.subMonths })}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="text-xs text-zinc-500 font-mono truncate mt-1">@{c.username}</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Social Links (public) */}
            <div
              className="lg:col-span-2 border border-zinc-800 bg-zinc-950/70 backdrop-blur-xs p-4"
              style={{
                clipPath:
                  "polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 12px 100%, 0 calc(100% - 12px))",
              }}
            >
              <div className="flex items-center gap-2 mb-3">
                <Globe className="w-4 h-4 text-red-500" />
                <h2 className="font-display text-base text-white tracking-wider">{t("social")}</h2>
              </div>
              {socialLinks.length === 0 ? (
                <p className="text-zinc-500 text-sm">{isOwnProfile ? t("socialEmptyOwn") : t("socialEmptyOther")}</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {socialLinks.map((l) => {
                    const Icon = SOCIAL_ICONS[l.platform] ?? Globe;
                    return (
                      <TrackedLink
                        key={l.id}
                        href={l.url}
                        beaconId={l.id}
                        className="flex items-center gap-2 border border-zinc-800 bg-black/30 px-3 py-2 hover:border-zinc-700 hover:bg-zinc-900/50 transition-all"
                      >
                        <Icon className="w-4 h-4 shrink-0" style={{ color: SOCIAL_COLORS[l.platform] }} />
                        <div className="min-w-0 flex-1">
                          <div className="text-[9px] font-mono uppercase tracking-widest text-zinc-500">{l.platform}</div>
                          <div className="text-xs text-white truncate">@{l.handle}</div>
                        </div>
                      </TrackedLink>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Achievements earned */}
          <div
            className="border border-zinc-800 bg-zinc-950/70 backdrop-blur-xs p-4"
            style={{
              clipPath:
                "polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 12px 100%, 0 calc(100% - 12px))",
            }}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Award className="w-4 h-4 text-red-500" />
                <h2 className="font-display text-base text-white tracking-wider">{t("achievements")}</h2>
              </div>
              <Link
                href="/achievements"
                className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 hover:text-red-400"
              >
                {t("seeAll")}
              </Link>
            </div>
            {earnedAchievements.length === 0 ? (
              <p className="text-zinc-500 text-sm">{t("noAchievements")}</p>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                {earnedAchievements.map((ua) => {
                  const style = RARITY_STYLE[ua.achievement.rarity] ?? RARITY_STYLE.common;
                  return (
                    <div
                      key={ua.id}
                      className={cn("border p-3 flex flex-col items-center text-center", style.border, style.bg)}
                      title={ua.achievement.description}
                    >
                      <div className="text-3xl mb-1.5">{ua.achievement.icon}</div>
                      <div className={cn("text-[11px] font-bold leading-tight", style.text)}>
                        {ua.achievement.name}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-600 mt-3 text-center">
              {t("achievementsCount", { count: earnedAchievements.length })}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function StatTile({ label, value, emoji }: { label: string; value: string; emoji: string }) {
  return (
    <div className="border border-zinc-800 bg-zinc-950/70 backdrop-blur-xs p-3">
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-base">{emoji}</span>
        <span className="text-[9px] font-mono uppercase tracking-widest text-zinc-500">
          {label}
        </span>
      </div>
      <div className="font-mono text-xl font-bold text-white tabular-nums">{value}</div>
    </div>
  );
}

function RankPosition({ label, position, hrefSort }: { label: string; position: number; hrefSort: string }) {
  return (
    <Link
      href={`/ranking?sort=${hrefSort}`}
      className="block border border-zinc-800 bg-black/30 p-3 hover:border-red-900/50 transition-all"
    >
      <div className="text-[9px] font-mono uppercase tracking-widest text-zinc-500 mb-1">
        {label}
      </div>
      <div className="font-display text-2xl text-white tracking-wider">
        #{position}
      </div>
    </Link>
  );
}
