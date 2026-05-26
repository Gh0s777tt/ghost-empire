"use client";
// src/components/profile/ProfileClient.tsx
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Trophy, Award, Link as LinkIcon, History, Loader2, Plus, X, Check,
  Instagram, Twitter, Youtube, Globe, Music2, Flame, MessageCircle, Mic2,
  Copy, ShieldCheck, Heart, Star, Crown, Ban,
} from "lucide-react";
import { fmt, formatDate, rankForLevel, xpForLevel, cn } from "@/lib/utils";

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
};

const RARITY_STYLE: Record<string, { border: string; bg: string; text: string; label: string }> = {
  common:    { border: "border-zinc-700",    bg: "bg-zinc-900/40",   text: "text-zinc-300",   label: "Pospolite" },
  rare:      { border: "border-blue-700",    bg: "bg-blue-950/30",   text: "text-blue-300",   label: "Rzadkie" },
  epic:      { border: "border-purple-700",  bg: "bg-purple-950/30", text: "text-purple-300", label: "Epickie" },
  legendary: { border: "border-orange-600",  bg: "bg-orange-950/30", text: "text-orange-300", label: "Legendarne" },
};

const SOCIAL_META: Record<string, { label: string; icon: typeof Instagram; color: string; placeholder: string }> = {
  instagram: { label: "Instagram", icon: Instagram, color: "#E4405F", placeholder: "twoj_handle" },
  twitter:   { label: "X (Twitter)", icon: Twitter, color: "#000",    placeholder: "twoj_handle" },
  tiktok:    { label: "TikTok",    icon: Music2,    color: "#fff",    placeholder: "twoj_handle" },
  youtube:   { label: "YouTube",   icon: Youtube,   color: "#FF0000", placeholder: "@channel lub link" },
  website:   { label: "Website",   icon: Globe,     color: "#10b981", placeholder: "domena.pl" },
};

const PLATFORM_META: Record<string, { label: string; color: string; emoji: string }> = {
  twitch:  { label: "Twitch",  color: "#9146FF", emoji: "💜" },
  discord: { label: "Discord", color: "#5865F2", emoji: "👾" },
  kick:    { label: "Kick",    color: "#53FC18", emoji: "🟢" },
  youtube: { label: "YouTube", color: "#FF0000", emoji: "📺" },
};

export function ProfileClient({
  user, connections, earnedAchievements, allAchievements, socialLinks, transactions,
}: Props) {
  const rank = rankForLevel(user.level);
  const xpNeeded = xpForLevel(user.level + 1);
  const xpCurrent = user.xp % 500;
  const xpProgress = Math.min(100, (xpCurrent / 500) * 100);
  const earnedIds = new Set(earnedAchievements.map((ua) => ua.achievement.id));

  const pendingDeliveries = transactions.filter(
    (t) => t.type === "spend" && t.status === "pending",
  );

  return (
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
                className="w-24 h-24 md:w-28 md:h-28 object-cover border-2"
                style={{ borderColor: rank.color }}
              />
            ) : (
              <div
                className="w-24 h-24 md:w-28 md:h-28 flex items-center justify-center text-4xl border-2 bg-zinc-900"
                style={{ borderColor: rank.color }}
              >
                👻
              </div>
            )}
            <div
              className="absolute -bottom-2 -right-2 px-2 py-0.5 text-[10px] font-bold tracking-widest uppercase"
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
                {user.displayName ?? user.name ?? "Anonymous"}
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
                  title={user.totalDonated > 0 ? `Łącznie wsparł: ${fmt(user.totalDonated)}` : "Donator"}
                >
                  <Heart className="w-2.5 h-2.5" /> DONATOR
                </span>
              )}
              {user.isBanned && (
                <span
                  className="text-[10px] font-bold tracking-widest uppercase border-2 border-red-600 bg-red-950/60 text-red-300 px-2 py-0.5 flex items-center gap-1"
                  title={user.banReason ?? "Konto zablokowane"}
                >
                  <Ban className="w-2.5 h-2.5" /> BANNED
                  {user.bannedUntil && ` (do ${new Date(user.bannedUntil).toLocaleDateString("pl-PL")})`}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 text-zinc-500 font-mono text-xs mb-3">
              <span>@{user.username ?? "unset"}</span>
              <span>·</span>
              <span style={{ color: rank.color }}>
                {rank.emoji} {rank.name}
              </span>
              <span>·</span>
              <span>Od {formatDate(user.createdAt)}</span>
            </div>

            {user.bio && (
              <p className="text-zinc-400 text-sm mb-4 italic">"{user.bio}"</p>
            )}

            {/* XP progress */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-widest">
                <span className="text-zinc-500">XP do LVL {user.level + 1}</span>
                <span className="text-white">
                  {fmt(xpCurrent)} / 500
                </span>
              </div>
              <div className="h-2 bg-zinc-900 border border-zinc-800 overflow-hidden">
                <div
                  className="h-full transition-all"
                  style={{
                    width: `${xpProgress}%`,
                    background: `linear-gradient(90deg, ${rank.color}, #E50914)`,
                  }}
                />
              </div>
              <p className="text-[10px] text-zinc-600 font-mono">
                Łącznie {fmt(user.xp)} XP · do max LVL 100 brakuje {fmt(Math.max(0, xpForLevel(100) - user.xp))} XP
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <StatTile label="Balans" value={fmt(user.tokens)} suffix="GT" emoji="👻" accent />
        <StatTile label="Zarobione" value={fmt(user.totalEarned)} suffix="GT" emoji="📈" />
        <StatTile label="Wydane" value={fmt(user.totalSpent)} suffix="GT" emoji="💸" />
        <StatTile label="Streak" value={user.streak.toString()} suffix={user.streak === 1 ? "dzień" : "dni"} emoji="🔥" />
        <StatTile label="Wiadomości" value={fmt(user.messageCount)} emoji="💬" />
        <StatTile label="Voice" value={fmt(user.voiceMinutes)} suffix="min" emoji="🎤" />
      </div>

      {/* Pending deliveries */}
      {pendingDeliveries.length > 0 && (
        <SectionCard
          title="Zamówienia w realizacji"
          icon={Flame}
          accent="orange"
          subtitle={`${pendingDeliveries.length} ${pendingDeliveries.length === 1 ? "zakup" : "zakupów"} czeka na dostawę`}
        >
          <div className="space-y-2">
            {pendingDeliveries.map((t) => (
              <div
                key={t.id}
                className="flex items-center gap-3 border border-orange-900/50 bg-orange-950/20 px-3 py-2.5"
              >
                <span className="text-2xl">{t.shopItem?.imageEmoji ?? "🎁"}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-white font-medium truncate">
                    {t.shopItem?.name ?? t.reason}
                  </div>
                  <div className="text-[10px] font-mono text-orange-400 uppercase tracking-widest">
                    Pending · zakup {formatDate(t.createdAt)}
                  </div>
                </div>
                <div className="text-xs font-mono text-zinc-500 hidden sm:block">
                  Skontaktuj się na Discord
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {/* Discord linking — only when not yet linked */}
      {!user.discordId && <DiscordLinkCard />}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Connections */}
        <SectionCard title="Połączone konta" icon={LinkIcon} className="lg:col-span-1">
          {connections.length === 0 ? (
            <p className="text-zinc-500 text-sm">Brak połączonych platform.</p>
          ) : (
            <div className="space-y-2">
              {connections.map((c) => {
                const meta = PLATFORM_META[c.platform] ?? { label: c.platform, color: "#888", emoji: "🔗" };
                return (
                  <div key={c.id} className="border border-zinc-800 bg-black/30 p-3">
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      <span className="text-lg">{meta.emoji}</span>
                      <span className="font-bold text-white text-sm">{meta.label}</span>
                      <div className="ml-auto flex items-center gap-1 flex-wrap justify-end">
                        {c.isModerator && (
                          <span
                            className="text-[9px] font-bold tracking-widest uppercase px-1.5 py-0.5 flex items-center gap-1"
                            style={{ background: "rgba(59,130,246,0.2)", color: "#60a5fa", border: "1px solid rgba(59,130,246,0.5)" }}
                            title="Moderator tej platformy"
                          >
                            <ShieldCheck className="w-2.5 h-2.5" /> MOD
                          </span>
                        )}
                        {c.isVip && (
                          <span
                            className="text-[9px] font-bold tracking-widest uppercase px-1.5 py-0.5 flex items-center gap-1"
                            style={{ background: "rgba(236,72,153,0.2)", color: "#f472b6", border: "1px solid rgba(236,72,153,0.5)" }}
                          >
                            <Star className="w-2.5 h-2.5" /> VIP
                          </span>
                        )}
                        {c.isSubscriber && (
                          <span
                            className="text-[9px] font-bold tracking-widest uppercase px-2 py-0.5"
                            style={{ background: meta.color + "30", color: meta.color, border: `1px solid ${meta.color}` }}
                          >
                            SUB {c.subTier ?? "?"} · {c.subMonths}mc
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-xs text-zinc-500 font-mono truncate">@{c.username}</div>
                  </div>
                );
              })}
            </div>
          )}
        </SectionCard>

        {/* Social links editor */}
        <SectionCard title="Social linki" icon={Globe} className="lg:col-span-2">
          <SocialLinksEditor initialLinks={socialLinks} />
        </SectionCard>
      </div>

      {/* Achievements */}
      <SectionCard
        title="Osiągnięcia"
        icon={Trophy}
        subtitle={`${earnedAchievements.length} / ${allAchievements.length} zdobyte`}
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
                  {style.label}
                </div>
              </div>
            );
          })}
        </div>
      </SectionCard>

      {/* Transaction history */}
      <SectionCard
        title="Historia transakcji"
        icon={History}
        subtitle={`Ostatnie ${transactions.length}`}
      >
        {transactions.length === 0 ? (
          <p className="text-zinc-500 text-sm">Brak transakcji.</p>
        ) : (
          <div className="divide-y divide-zinc-900">
            {transactions.map((t) => {
              const isEarn = t.amount > 0;
              return (
                <div key={t.id} className="flex items-center gap-3 py-2.5">
                  <span className="text-xl flex-shrink-0">
                    {t.shopItem?.imageEmoji ?? (isEarn ? "📈" : "🛒")}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-white truncate">
                      {t.shopItem?.name ?? prettyReason(t.reason)}
                    </div>
                    <div className="text-[10px] font-mono text-zinc-600 uppercase tracking-widest">
                      {formatDate(t.createdAt)}
                      {t.multiplier && t.multiplier !== 1 ? ` · ×${t.multiplier}` : ""}
                      {t.status !== "completed" ? ` · ${t.status}` : ""}
                    </div>
                  </div>
                  <div
                    className={cn(
                      "font-mono font-bold text-sm tabular-nums",
                      isEarn ? "text-green-400" : "text-red-400",
                    )}
                  >
                    {isEarn ? "+" : ""}
                    {fmt(t.amount)} GT
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
        "border bg-zinc-950/70 backdrop-blur-sm p-3",
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
        {suffix && <span className="text-zinc-500 text-xs ml-1">{suffix}</span>}
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
      className={cn("border bg-zinc-950/70 backdrop-blur-sm p-5", borderColor, className)}
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

function SocialLinksEditor({
  initialLinks,
}: {
  initialLinks: Array<{ id: string; platform: string; handle: string; url: string }>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [links, setLinks] = useState(initialLinks);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const allPlatforms = Object.keys(SOCIAL_META);

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
        setEditing(null);
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
      const res = await fetch(`/api/profile/social-links?platform=${platform}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setLinks((prev) => prev.filter((l) => l.platform !== platform));
        startTransition(() => router.refresh());
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {allPlatforms.map((platform) => {
        const meta = SOCIAL_META[platform];
        const Icon = meta.icon;
        const existing = links.find((l) => l.platform === platform);
        const isEditing = editing === platform;
        const isBusy = busy === platform || pending;

        if (isEditing) {
          return (
            <div key={platform} className="border border-red-900/50 bg-black/40 p-2.5 flex items-center gap-2">
              <Icon className="w-4 h-4 flex-shrink-0" style={{ color: meta.color }} />
              <input
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") save(platform);
                  if (e.key === "Escape") { setEditing(null); setDraft(""); }
                }}
                placeholder={meta.placeholder}
                className="flex-1 bg-transparent text-xs text-white outline-none font-mono min-w-0"
              />
              <button
                onClick={() => save(platform)}
                disabled={isBusy || !draft.trim()}
                className="text-green-400 hover:text-green-300 disabled:opacity-30"
              >
                {isBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              </button>
              <button
                onClick={() => { setEditing(null); setDraft(""); }}
                className="text-zinc-500 hover:text-zinc-300"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        }

        return (
          <div
            key={platform}
            className={cn(
              "border bg-black/30 p-2.5 flex items-center gap-2",
              existing ? "border-zinc-800" : "border-zinc-900",
            )}
          >
            <Icon className="w-4 h-4 flex-shrink-0" style={{ color: meta.color }} />
            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">
                {meta.label}
              </div>
              {existing ? (
                <a
                  href={existing.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-white hover:text-red-400 font-mono truncate block"
                >
                  @{existing.handle}
                </a>
              ) : (
                <span className="text-xs text-zinc-600 italic">Brak</span>
              )}
            </div>
            {existing ? (
              <>
                <button
                  onClick={() => { setEditing(platform); setDraft(existing.handle); }}
                  disabled={isBusy}
                  className="text-zinc-500 hover:text-zinc-300 text-[10px] font-mono uppercase tracking-widest"
                >
                  Edytuj
                </button>
                <button
                  onClick={() => remove(platform)}
                  disabled={isBusy}
                  className="text-red-500 hover:text-red-400 disabled:opacity-30"
                  title="Usuń"
                >
                  {isBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
                </button>
              </>
            ) : (
              <button
                onClick={() => { setEditing(platform); setDraft(""); }}
                disabled={isBusy}
                className="text-zinc-500 hover:text-red-400"
                title="Dodaj"
              >
                <Plus className="w-4 h-4" />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

function DiscordLinkCard() {
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
        setErr(data.error ?? "Błąd");
      } else {
        setCode(data.code);
        setExpiresAt(data.expiresAt);
      }
    } catch {
      setErr("Brak połączenia");
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
      className="border-2 border-indigo-700 bg-gradient-to-br from-indigo-950/40 to-purple-950/20 backdrop-blur-sm p-5"
      style={{
        clipPath:
          "polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 12px 100%, 0 calc(100% - 12px))",
      }}
    >
      <div className="flex items-start gap-4">
        <div className="text-4xl flex-shrink-0">👾</div>
        <div className="flex-1">
          <h3 className="font-display text-lg text-white tracking-wider mb-1">
            POŁĄCZ DISCORD
          </h3>
          <p className="text-zinc-400 text-xs leading-relaxed mb-4">
            Bez połączenia bot Ghost Empire NIE może Ci dawać tokenów za aktywność na Discord
            (wiadomości + voice). Wygeneruj kod i wpisz go w komendzie{" "}
            <code className="bg-black/40 px-1.5 py-0.5 text-indigo-300 font-mono">
              /link kod:XXXXXX
            </code>{" "}
            na serwerze Discord Ghosta.
          </p>

          {!code ? (
            <button
              onClick={generate}
              disabled={busy}
              className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold tracking-widest uppercase transition-all disabled:opacity-50 flex items-center gap-2"
            >
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LinkIcon className="w-3.5 h-3.5" />}
              Wygeneruj kod
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
                  title="Kopiuj kod"
                >
                  {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
              <div className="text-[10px] font-mono uppercase tracking-widest text-indigo-400 flex items-center justify-between">
                <span>1. Skopiuj kod</span>
                <span>2. Na Discordzie napisz: /link kod:{code}</span>
              </div>
              <p className="text-[10px] text-zinc-500">
                Kod wygasa za 10 minut. Po użyciu odśwież tę stronę.
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

function prettyReason(reason: string): string {
  if (reason === "welcome_bonus") return "Bonus powitalny";
  if (reason === "message") return "Wiadomość Discord";
  if (reason === "voice") return "Aktywność voice";
  if (reason.startsWith("daily_task:")) return "Daily quest";
  if (reason.startsWith("shop:")) return reason.slice(5);
  return reason;
}
