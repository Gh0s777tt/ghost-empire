"use client";
// src/components/home/HomeClient.tsx
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { Ghost, Radio, Eye, Target, Flame, Calendar, Award, ChevronRight, ArrowUp, ArrowDown, Check, Clock, Users, Zap, Gift, Trophy } from "lucide-react";
import { fmt, timeLeft, rankForLevel } from "@/lib/utils";
import type { Session } from "next-auth";

type Props = {
  session: Session | null;
  userData: any;
  hotItems: any[];
  activeEvents: any[];
  topUsers: any[];
};

const STREAM_STATUS = {
  isLive: false, // This would come from Twitch API (Phase 2)
  game: "Counter-Strike 2",
  title: "GRINDIN FACEIT — drop kody na chacie!",
  viewers: 1247,
};

export function HomeClient({ session, userData, hotItems, activeEvents, topUsers }: Props) {
  const router = useRouter();
  const user = userData?.user;
  const tasks = userData?.tasks ?? [];
  const achievements = userData?.achievements ?? [];

  if (!session) {
    return <GuestView topUsers={topUsers} hotItems={hotItems} activeEvents={activeEvents} />;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Live banner */}
      {STREAM_STATUS.isLive && (
        <LiveBanner />
      )}

      {/* Profile hero */}
      {user && <ProfileHero user={user} />}

      {/* Two-column row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Daily tasks */}
        <div className="lg:col-span-1 border border-zinc-800 bg-zinc-950/60 clip-corner">
          <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Target className="w-4 h-4 text-red-500" />
              <h3 className="font-display text-lg tracking-wider text-white">DAILY QUESTS</h3>
            </div>
            <span className="font-mono text-[10px] text-zinc-500">RESET: PÓŁNOC</span>
          </div>
          <div className="p-4 space-y-3">
            {tasks.length === 0 ? (
              <p className="text-sm text-zinc-500 text-center py-4">Ładowanie zadań...</p>
            ) : (
              tasks.map((ut: any) => (
                <DailyTaskCard key={ut.id} userTask={ut} userId={user?.id} />
              ))
            )}
          </div>
        </div>

        {/* Hot items */}
        <div className="lg:col-span-2 border border-zinc-800 bg-zinc-950/60 clip-corner">
          <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Flame className="w-4 h-4 text-orange-500" />
              <h3 className="font-display text-lg tracking-wider text-white">GORĄCE W SKLEPIE</h3>
            </div>
            <button
              onClick={() => router.push("/shop")}
              className="text-[10px] font-bold tracking-wider text-zinc-400 hover:text-red-400 flex items-center gap-1"
            >
              WSZYSTKO <ChevronRight className="w-3 h-3" />
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
            <h3 className="font-display text-lg tracking-wider text-white">AKTYWNE EVENTY</h3>
          </div>
          <button
            onClick={() => router.push("/events")}
            className="text-[10px] font-bold tracking-wider text-zinc-400 hover:text-red-400 flex items-center gap-1"
          >
            WSZYSTKIE <ChevronRight className="w-3 h-3" />
          </button>
        </div>
        <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
          {activeEvents.map((ev) => (
            <EventMiniCard key={ev.id} event={ev} />
          ))}
          {activeEvents.length === 0 && (
            <p className="text-zinc-600 text-sm text-center py-4 col-span-2">
              Brak aktywnych eventów. Wkrótce więcej!
            </p>
          )}
        </div>
      </div>

      {/* Recent achievements */}
      {achievements.length > 0 && (
        <div className="border border-zinc-800 bg-zinc-950/60 clip-corner">
          <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Award className="w-4 h-4 text-yellow-500" />
              <h3 className="font-display text-lg tracking-wider text-white">OSTATNIE OSIĄGNIĘCIA</h3>
            </div>
            <button
              onClick={() => router.push("/achievements")}
              className="text-[10px] font-bold tracking-wider text-zinc-400 hover:text-red-400 flex items-center gap-1"
            >
              WSZYSTKIE <ChevronRight className="w-3 h-3" />
            </button>
          </div>
          <div className="p-4 grid grid-cols-3 sm:grid-cols-6 gap-3">
            {achievements.map((ua: any) => (
              <AchievementBadgeSmall key={ua.id} achievement={ua.achievement} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---- GUEST VIEW ----
function GuestView({ topUsers, hotItems, activeEvents }: any) {
  return (
    <div className="space-y-12 animate-fade-in">
      {/* Hero */}
      <div className="text-center py-16">
        <div className="flex justify-center mb-8">
          <div
            className="w-24 h-24 flex items-center justify-center"
            style={{
              background: "linear-gradient(135deg, #E50914, #8B0000)",
              clipPath: "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)",
            }}
          >
            <Ghost className="w-12 h-12 text-white" strokeWidth={1.5} />
          </div>
        </div>
        <h1
          className="font-display text-6xl sm:text-7xl text-white mb-4"
          style={{ textShadow: "3px 0 0 rgba(229,9,20,0.7), -3px 0 0 rgba(139,0,0,0.5)" }}
        >
          GH0ST EMPIRE
        </h1>
        <p className="text-zinc-400 text-lg mb-8 max-w-xl mx-auto">
          Zbieraj Ghost Tokens, wymieniaj na realne nagrody, rywalizuj w rankingu.
          Oficjalny portal społeczności streamera Gh0s77tt.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={() => signIn()}
            className="px-8 py-4 bg-red-600 hover:bg-red-500 text-white font-bold tracking-widest uppercase transition-all text-sm clip-tag"
          >
            👻 DOŁĄCZ DO IMPERIUM
          </button>
          <a
            href="https://twitch.tv/gh0s77tt"
            target="_blank"
            rel="noreferrer"
            className="px-8 py-4 border border-zinc-700 hover:border-zinc-500 text-zinc-300 font-bold tracking-widest uppercase transition-all text-sm"
          >
            💜 OGLĄDAJ NA TWITCH
          </a>
        </div>
      </div>

      {/* Stats teaser */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "AKTYWNYCH GRACZY", value: "847+" },
          { label: "GHOST TOKENS ROZDANYCH", value: "12M+" },
          { label: "NAGRÓD W SKLEPIE", value: "12" },
          { label: "EVENTÓW ŁĄCZNIE", value: "34" },
        ].map((s) => (
          <div key={s.label} className="border border-zinc-800 bg-zinc-950/60 p-4 text-center clip-corner">
            <div className="font-display text-3xl text-red-500">{s.value}</div>
            <div className="font-mono text-[10px] tracking-widest text-zinc-500 mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Top 3 preview */}
      <div>
        <h2 className="font-display text-2xl text-white mb-4">TOP GRACZE</h2>
        <div className="space-y-2">
          {topUsers.map((u: any, i: number) => (
            <div key={u.id} className="flex items-center gap-4 p-4 border border-zinc-800 bg-zinc-950/60">
              <span className="font-display text-3xl text-zinc-600">#{i + 1}</span>
              <div
                className="w-10 h-10 border border-zinc-700 overflow-hidden bg-zinc-900 flex items-center justify-center text-lg"
              >
                {u.image ? <img src={u.image} alt="" className="w-full h-full object-cover" /> : "👻"}
              </div>
              <div className="flex-1">
                <p className="font-bold text-white">{u.displayName ?? u.username}</p>
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
function ProfileHero({ user }: { user: any }) {
  const rank = rankForLevel(user.level);
  const xpForNext = user.level * 500;
  const xpPct = Math.min((user.xp % 500) / 500 * 100, 100);

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
          <div className="relative flex-shrink-0">
            <div className="absolute -inset-1 bg-gradient-to-br from-red-600 to-red-900 blur-sm opacity-50" />
            <div className="relative w-20 h-20 border-2 border-red-500 overflow-hidden bg-zinc-900 clip-corner">
              {user.image ? (
                <img src={user.image} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-3xl">👻</div>
              )}
            </div>
            <div
              className="absolute -bottom-1.5 -right-1.5 px-1.5 py-0.5 bg-red-600 text-white font-mono text-[9px] font-bold clip-tag"
            >
              LVL {user.level}
            </div>
          </div>
          <div>
            <h2 className="font-display text-2xl text-white">{user.displayName ?? user.username}</h2>
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
          <StatBox icon="👻" label="GHOST TOKENS" value={fmt(user.tokens)} accent />
          <StatBox icon="⬆️" label="ZAROBIONE" value={fmt(user.totalEarned)} />
          <StatBox icon="🛍️" label="WYDANE" value={fmt(user.totalSpent)} />
          <StatBox icon="💬" label="WIADOMOŚCI" value={fmt(user.messageCount)} />
        </div>

        {/* XP bar */}
        <div className="lg:col-span-12">
          <div className="flex items-end justify-between mb-1.5">
            <span className="font-mono text-[10px] tracking-widest text-zinc-500">
              POSTĘP DO LVL {user.level + 1}
            </span>
            <span className="font-mono text-xs text-zinc-400">
              <span className="text-white font-bold">{user.xp % 500}</span>/{500} XP
            </span>
          </div>
          <div className="relative h-2.5 bg-zinc-900 border border-zinc-800 overflow-hidden">
            <div
              className="absolute inset-y-0 left-0 transition-all duration-700"
              style={{
                width: `${xpPct}%`,
                background:
                  "linear-gradient(90deg, #8B0000 0%, #E50914 50%, #FF4500 100%)",
                boxShadow: "0 0 12px rgba(229,9,20,0.5)",
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function StatBox({ icon, label, value, accent = false }: any) {
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
function DailyTaskCard({ userTask, userId }: { userTask: any; userId: string }) {
  const { task, progress, done, claimed } = userTask;
  const pct = Math.min((progress / task.target) * 100, 100);
  const ready = progress >= task.target && !claimed;

  const handleClaim = async () => {
    await fetch("/api/tasks/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskId: task.id }),
    });
    window.location.reload();
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
          className={`absolute inset-y-0 left-0 transition-all ${claimed ? "bg-green-500" : "bg-red-600"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] text-zinc-500">
          {progress}/{task.target}
        </span>
        {claimed ? (
          <span className="text-[10px] font-bold tracking-wider text-green-400 flex items-center gap-1">
            <Check className="w-3 h-3" /> ODEBRANE
          </span>
        ) : ready ? (
          <button
            onClick={handleClaim}
            className="text-[10px] font-bold tracking-wider text-red-400 hover:text-red-300 px-2 py-0.5 border border-red-500/50 hover:border-red-500 transition-all"
          >
            ODBIERZ
          </button>
        ) : (
          <span className="text-[10px] font-bold tracking-wider text-zinc-600">W TRAKCIE</span>
        )}
      </div>
    </div>
  );
}

// ---- MINI SHOP CARD ----
function MiniShopCard({ item, userTokens, onClick }: any) {
  const canAfford = userTokens >= item.price;
  return (
    <button
      onClick={onClick}
      className="relative p-3 border border-zinc-800 hover:border-red-500 bg-zinc-900/40 text-left transition-all group clip-corner w-full"
    >
      <div className="flex items-start gap-3">
        <div className="text-3xl flex-shrink-0">{item.imageEmoji}</div>
        <div className="min-w-0 flex-1">
          <h4 className="text-xs font-bold text-white leading-tight truncate group-hover:text-red-300 transition-colors">
            {item.name}
          </h4>
          <div className="flex items-center gap-1 mt-1.5">
            <span className="text-xs">👻</span>
            <span
              className={`font-mono text-xs font-bold tabular-nums ${
                canAfford ? "text-white" : "text-zinc-600"
              }`}
            >
              {fmt(item.price)}
            </span>
          </div>
          {item.stock !== -1 && (
            <div className="font-mono text-[9px] text-zinc-500 mt-0.5">
              Pula: {item.stock}/{item.totalStock}
            </div>
          )}
        </div>
      </div>
      <div className="absolute top-1 right-1 px-1.5 py-0.5 bg-red-600/20 border border-red-500/50">
        <span className="font-mono text-[8px] font-bold text-red-300 tracking-widest">HOT</span>
      </div>
    </button>
  );
}

// ---- EVENT MINI CARD ----
function EventMiniCard({ event }: { event: any }) {
  const typeStyles: Record<string, any> = {
    happy_hour: { icon: Zap,    color: "#E50914", label: "HAPPY HOUR" },
    giveaway:   { icon: Gift,   color: "#FFD700", label: "GIVEAWAY" },
    raffle:     { icon: Trophy, color: "#FF9500", label: "RAFFLE" },
    contest:    { icon: Target, color: "#00BFFF", label: "KONKURS" },
  };
  const s = typeStyles[event.type] ?? typeStyles.giveaway;
  const Icon = s.icon;

  return (
    <div className="flex items-start gap-3 p-3 border border-zinc-800 bg-zinc-900/30 hover:border-zinc-600 transition-all">
      <div
        className="w-10 h-10 flex-shrink-0 flex items-center justify-center border"
        style={{ borderColor: s.color, background: `${s.color}15` }}
      >
        <Icon className="w-5 h-5" style={{ color: s.color }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span
            className="font-mono text-[9px] font-bold tracking-widest"
            style={{ color: s.color }}
          >
            {s.label}
          </span>
          {event.multiplier && (
            <span className="font-mono text-[10px] font-bold text-red-300">
              ×{event.multiplier}
            </span>
          )}
        </div>
        <h4 className="text-sm font-bold text-white leading-tight">{event.name}</h4>
        <div className="flex items-center gap-3 mt-1.5 font-mono text-[10px] text-zinc-500">
          {event.endsAt && (
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {timeLeft(event.endsAt)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ---- ACHIEVEMENT BADGE (small) ----
function AchievementBadgeSmall({ achievement }: { achievement: any }) {
  const rarityBg: Record<string, string> = {
    common:    "from-zinc-800 to-zinc-900 border-zinc-600",
    rare:      "from-blue-900 to-blue-950 border-blue-500",
    epic:      "from-purple-900 to-purple-950 border-purple-500",
    legendary: "from-yellow-900 to-orange-950 border-yellow-500",
  };
  const bg = rarityBg[achievement.rarity] ?? rarityBg.common;

  return (
    <div
      className={`p-3 border bg-gradient-to-br ${bg} text-center clip-corner hover:scale-105 transition-transform`}
      title={achievement.name}
    >
      <div className="text-2xl">{achievement.icon}</div>
    </div>
  );
}

// ---- LIVE BANNER ----
function LiveBanner() {
  return (
    <div
      className="relative overflow-hidden border border-red-900/60 clip-corner"
      style={{ background: "linear-gradient(90deg, rgba(139,0,0,0.4) 0%, rgba(0,0,0,0.9) 60%)" }}
    >
      <div
        className="absolute inset-0 opacity-30"
        style={{ background: "radial-gradient(circle at 20% 50%, #E50914 0%, transparent 50%)" }}
      />
      <div className="relative p-4 flex items-center gap-4">
        <div className="relative flex-shrink-0">
          <div
            className="w-14 h-14 border-2 border-red-500 flex items-center justify-center clip-corner"
            style={{ background: "linear-gradient(135deg, #1a0000, #000)" }}
          >
            <Radio className="w-7 h-7 text-red-500" />
          </div>
          <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="font-mono text-[10px] tracking-widest text-red-400 font-bold">
              ● LIVE NA TWITCH
            </span>
            <span className="font-mono text-[10px] text-zinc-500">
              {fmt(STREAM_STATUS.viewers)} oglądających
            </span>
          </div>
          <h2 className="font-display text-xl text-white truncate">{STREAM_STATUS.title}</h2>
          <p className="text-xs text-zinc-400">🎮 {STREAM_STATUS.game}</p>
        </div>
        <a
          href="https://twitch.tv/gh0s77tt"
          target="_blank"
          rel="noreferrer"
          className="hidden sm:flex flex-shrink-0 items-center gap-2 px-4 py-2.5 bg-red-600 hover:bg-red-500 text-white font-bold text-xs uppercase tracking-wider transition-colors clip-tag"
        >
          <Eye className="w-3.5 h-3.5" /> Oglądaj
        </a>
      </div>
    </div>
  );
}
