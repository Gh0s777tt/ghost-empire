// src/app/u/[username]/page.tsx
// Public profile — visible to anyone (no auth required). Shows only public stats.
import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Header } from "@/components/Header";
import {
  Trophy, Award, Link as LinkIcon, Globe, MessageCircle, Mic2, Flame,
  ShieldCheck, Heart, Crown, Ban, Star, Instagram, Twitter, Youtube, Music2,
} from "lucide-react";
import Link from "next/link";
import { fmt, formatDate, rankForLevel, xpForLevel, cn } from "@/lib/utils";

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

const SOCIAL_ICONS: Record<string, typeof Instagram> = {
  instagram: Instagram,
  twitter:   Twitter,
  tiktok:    Music2,
  youtube:   Youtube,
  website:   Globe,
};

const SOCIAL_COLORS: Record<string, string> = {
  instagram: "#E4405F",
  twitter:   "#000",
  tiktok:    "#FE2C55",
  youtube:   "#FF0000",
  website:   "#10b981",
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const user = await prisma.user.findUnique({
    where: { username },
    select: { displayName: true, username: true, bio: true },
  });
  if (!user) return { title: "Nie znaleziono" };
  return {
    title: `${user.displayName ?? user.username}`,
    description: user.bio ?? `Profil ${user.displayName ?? user.username} w Ghost Empire`,
  };
}

export default async function PublicProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const session = await getServerSession(authOptions);
  const isOwnProfile = session?.user?.username === username;

  const user = await prisma.user.findUnique({
    where: { username },
    select: {
      id: true,
      username: true,
      displayName: true,
      name: true,
      image: true,
      bio: true,
      // Public stats only
      level: true,
      xp: true,
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
      // PRIVATE — NOT exposed: tokens (balance), totalSpent, email, modNote, banReason
    },
  });

  if (!user) notFound();

  const [connections, earnedAchievements, socialLinks, rankPositions] = await Promise.all([
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
    // Compute ranking positions
    Promise.all([
      prisma.user.count({ where: { totalEarned: { gt: user.totalEarned } } }),
      prisma.user.count({
        where: {
          OR: [
            { level: { gt: user.level } },
            { level: user.level, xp: { gt: user.xp } },
          ],
        },
      }),
      prisma.user.count({ where: { streak: { gt: user.streak } } }),
    ]),
  ]);

  const [aheadByEarned, aheadByLevel, aheadByStreak] = rankPositions;
  const rankInfo = rankForLevel(user.level);
  const xpCurrent = user.xp % 500;
  const xpProgress = Math.min(100, (xpCurrent / 500) * 100);

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
            className="border border-zinc-800 bg-zinc-950/80 backdrop-blur-sm p-6"
            style={{
              clipPath:
                "polygon(0 0, calc(100% - 16px) 0, 100% 16px, 100% 100%, 16px 100%, 0 calc(100% - 16px))",
            }}
          >
            <div className="flex flex-col md:flex-row gap-6 items-start">
              <div className="relative flex-shrink-0">
                {user.image ? (
                  <img
                    src={user.image}
                    alt={user.name ?? ""}
                    className="w-24 h-24 md:w-32 md:h-32 object-cover border-2"
                    style={{ borderColor: rankInfo.color }}
                  />
                ) : (
                  <div
                    className="w-24 h-24 md:w-32 md:h-32 flex items-center justify-center text-5xl border-2 bg-zinc-900"
                    style={{ borderColor: rankInfo.color }}
                  >
                    👻
                  </div>
                )}
                <div
                  className="absolute -bottom-2 -right-2 px-2 py-0.5 text-[10px] font-bold tracking-widest uppercase"
                  style={{ background: rankInfo.color, color: "#000" }}
                >
                  LVL {user.level}
                </div>
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-baseline gap-2 mb-1">
                  <h1
                    className="font-display text-3xl md:text-4xl text-white tracking-wider"
                    style={{ textShadow: `2px 0 0 ${rankInfo.color}88, -2px 0 0 rgba(139,0,0,0.4)` }}
                  >
                    {user.displayName ?? user.name ?? "Anonim"}
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
                  <span>·</span>
                  <span>Od {formatDate(user.createdAt)}</span>
                </div>
                {user.bio && (
                  <p className="text-zinc-400 text-sm mb-4 italic">"{user.bio}"</p>
                )}

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-widest">
                    <span className="text-zinc-500">XP do LVL {user.level + 1}</span>
                    <span className="text-white">{fmt(xpCurrent)} / 500</span>
                  </div>
                  <div className="h-2 bg-zinc-900 border border-zinc-800 overflow-hidden">
                    <div
                      className="h-full transition-all"
                      style={{
                        width: `${xpProgress}%`,
                        background: `linear-gradient(90deg, ${rankInfo.color}, #E50914)`,
                      }}
                    />
                  </div>
                  <p className="text-[10px] text-zinc-600 font-mono">
                    Łącznie {fmt(user.xp)} XP / {fmt(xpForLevel(100))} XP do max LVL
                  </p>
                </div>
              </div>

              {isOwnProfile && (
                <Link
                  href="/profile"
                  className="px-3 py-2 border border-red-700 hover:border-red-500 text-red-400 hover:text-red-300 text-[10px] font-bold tracking-widest uppercase flex-shrink-0"
                >
                  → Twój panel
                </Link>
              )}
            </div>
          </div>

          {/* Public stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatTile label="Lifetime GT" value={fmt(user.totalEarned)} emoji="📈" />
            <StatTile label="Streak" value={`${user.streak} ${user.streak === 1 ? "dzień" : "dni"}`} emoji="🔥" />
            <StatTile label="Wiadomości" value={fmt(user.messageCount)} emoji="💬" />
            <StatTile label="Voice" value={`${fmt(user.voiceMinutes)} min`} emoji="🎤" />
          </div>

          {/* Ranking positions */}
          <div
            className="border border-zinc-800 bg-zinc-950/70 backdrop-blur-sm p-4"
            style={{
              clipPath:
                "polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 12px 100%, 0 calc(100% - 12px))",
            }}
          >
            <div className="flex items-center gap-2 mb-3">
              <Trophy className="w-4 h-4 text-red-500" />
              <h2 className="font-display text-base text-white tracking-wider">POZYCJA W RANKINGU</h2>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <RankPosition label="Lifetime GT" position={aheadByEarned + 1} hrefSort="totalEarned" />
              <RankPosition label="Level" position={aheadByLevel + 1} hrefSort="level" />
              <RankPosition label="Streak" position={aheadByStreak + 1} hrefSort="streak" />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Connections */}
            <div
              className="lg:col-span-1 border border-zinc-800 bg-zinc-950/70 backdrop-blur-sm p-4"
              style={{
                clipPath:
                  "polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 12px 100%, 0 calc(100% - 12px))",
              }}
            >
              <div className="flex items-center gap-2 mb-3">
                <LinkIcon className="w-4 h-4 text-red-500" />
                <h2 className="font-display text-base text-white tracking-wider">PLATFORMY</h2>
              </div>
              {connections.length === 0 ? (
                <p className="text-zinc-500 text-sm">Brak połączeń.</p>
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
                                SUB {c.subTier ?? "?"} · {c.subMonths}mc
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
              className="lg:col-span-2 border border-zinc-800 bg-zinc-950/70 backdrop-blur-sm p-4"
              style={{
                clipPath:
                  "polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 12px 100%, 0 calc(100% - 12px))",
              }}
            >
              <div className="flex items-center gap-2 mb-3">
                <Globe className="w-4 h-4 text-red-500" />
                <h2 className="font-display text-base text-white tracking-wider">SOCIAL LINKI</h2>
              </div>
              {socialLinks.length === 0 ? (
                <p className="text-zinc-500 text-sm">{isOwnProfile ? "Brak — dodaj na /profile" : "User nie podał social linków."}</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {socialLinks.map((l) => {
                    const Icon = SOCIAL_ICONS[l.platform] ?? Globe;
                    return (
                      <a
                        key={l.id}
                        href={l.url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-2 border border-zinc-800 bg-black/30 px-3 py-2 hover:border-zinc-700 hover:bg-zinc-900/50 transition-all"
                      >
                        <Icon className="w-4 h-4 flex-shrink-0" style={{ color: SOCIAL_COLORS[l.platform] }} />
                        <div className="min-w-0 flex-1">
                          <div className="text-[9px] font-mono uppercase tracking-widest text-zinc-500">{l.platform}</div>
                          <div className="text-xs text-white truncate">@{l.handle}</div>
                        </div>
                      </a>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Achievements earned */}
          <div
            className="border border-zinc-800 bg-zinc-950/70 backdrop-blur-sm p-4"
            style={{
              clipPath:
                "polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 12px 100%, 0 calc(100% - 12px))",
            }}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Award className="w-4 h-4 text-red-500" />
                <h2 className="font-display text-base text-white tracking-wider">OSIĄGNIĘCIA</h2>
              </div>
              <Link
                href="/achievements"
                className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 hover:text-red-400"
              >
                Wszystkie →
              </Link>
            </div>
            {earnedAchievements.length === 0 ? (
              <p className="text-zinc-500 text-sm">Brak zdobytych osiągnięć.</p>
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
              {earnedAchievements.length} osiągnięć zdobytych
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function StatTile({ label, value, emoji }: { label: string; value: string; emoji: string }) {
  return (
    <div className="border border-zinc-800 bg-zinc-950/70 backdrop-blur-sm p-3">
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
