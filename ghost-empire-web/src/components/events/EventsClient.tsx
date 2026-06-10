"use client";
// src/components/events/EventsClient.tsx
import { useState, useEffect, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useSession, signIn } from "next-auth/react";
import { useTranslations } from "next-intl";
import HowItWorks from "@/components/HowItWorks";
import {
  Calendar, Gift, Ticket, Trophy, Zap, Users, Clock, Check, X, Loader2, Minus, Plus, Crown,
} from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { cn, displayNick } from "@/lib/utils";
import { useLocaleFmt } from "@/lib/use-locale-fmt";

type Winner = {
  id: string;
  username: string | null;
  displayName: string | null;
  image: string | null;
};

type EventData = {
  id: string;
  type: string;
  name: string;
  description: string | null;
  multiplier: number | null;
  prize: string | null;
  prizeImageUrl: string | null;
  winnersCount: number | null;
  requirement: string | null;
  ticketPrice: number | null;
  maxTicketsPerUser: number | null;
  startsAt: string | null;
  endsAt: string | null;
  drawnAt: string | null;
  entriesCount: number;
  ticketsCount: number;
  winners: Winner[];
};

const TYPE_META: Record<
  string,
  { icon: typeof Gift; color: string; bg: string; border: string }
> = {
  happy_hour: { icon: Zap,    color: "#FF4500", bg: "bg-orange-950/30", border: "border-orange-700" },
  giveaway:   { icon: Gift,   color: "#10b981", bg: "bg-emerald-950/30", border: "border-emerald-700" },
  raffle:     { icon: Ticket, color: "#8b5cf6", bg: "bg-purple-950/30",  border: "border-purple-700" },
  contest:    { icon: Trophy, color: "#3b82f6", bg: "bg-blue-950/30",    border: "border-blue-700" },
};

// Type labels are resolved at render via translations (see EventBase).
const TYPE_LABEL_KEY: Record<string, "typeHappyHour" | "typeGiveaway" | "typeRaffle" | "typeContest"> = {
  happy_hour: "typeHappyHour", giveaway: "typeGiveaway", raffle: "typeRaffle", contest: "typeContest",
};

export function EventsClient({
  events, userTickets, userEntries, userTokens, isAuthenticated,
}: {
  events: EventData[];
  userTickets: Record<string, number>;
  userEntries: string[];
  userTokens: number;
  isAuthenticated: boolean;
}) {
  const t = useTranslations("events");
  const router = useRouter();
  const { update: refreshSession } = useSession();
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const entriesSet = useMemo(() => new Set(userEntries), [userEntries]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  function showToast(kind: "ok" | "err", msg: string) {
    setToast({ kind, msg });
    setTimeout(() => setToast(null), 4500);
  }

  async function joinEvent(eventId: string) {
    setBusyId(eventId);
    try {
      const res = await fetch("/api/events/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast("err", data.error ?? t("err"));
      } else {
        showToast("ok", t("joined"));
        startTransition(() => router.refresh());
      }
    } finally {
      setBusyId(null);
    }
  }

  async function buyTickets(eventId: string, count: number) {
    setBusyId(eventId);
    try {
      const res = await fetch("/api/events/raffle-tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId, count }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast("err", data.error ?? t("err"));
      } else {
        showToast(
          "ok",
          t("boughtTickets", { count: data.bought, first: data.firstTicket, last: data.lastTicket }),
        );
        await refreshSession();
        startTransition(() => router.refresh());
      }
    } finally {
      setBusyId(null);
    }
  }

  const happyHours = events.filter((e) => e.type === "happy_hour");
  const giveaways = events.filter((e) => e.type === "giveaway");
  const raffles = events.filter((e) => e.type === "raffle");
  const contests = events.filter((e) => e.type === "contest");

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-2">
          <Calendar className="w-6 h-6 text-red-500" />
          <h1
            className="font-display text-4xl text-white tracking-wider"
            style={{ textShadow: "2px 0 0 rgba(229,9,20,0.6), -2px 0 0 rgba(139,0,0,0.4)" }}
          >
            {t("title")}
          </h1>
        </div>
        <p className="text-zinc-500 text-sm">
          {t("subtitle")}
        </p>
        <HowItWorks>{t("help")}</HowItWorks>
      </div>

      {events.length === 0 && (
        <EmptyState
          icon={<Calendar className="w-6 h-6" />}
          title={t("emptyTitle")}
          message={t("emptyMsg")}
        />
      )}

      {/* Happy Hour section - banner style */}
      {happyHours.length > 0 && (
        <div className="space-y-3">
          {happyHours.map((e) => (
            <HappyHourBanner key={e.id} event={e} now={now} />
          ))}
        </div>
      )}

      {/* Giveaways */}
      {giveaways.length > 0 && (
        <Section title={t("secGiveaways")} count={giveaways.length}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {giveaways.map((e) => (
              <GiveawayCard
                key={e.id}
                event={e}
                now={now}
                isAuthenticated={isAuthenticated}
                joined={entriesSet.has(e.id)}
                busy={busyId === e.id || pending}
                onJoin={() => joinEvent(e.id)}
              />
            ))}
          </div>
        </Section>
      )}

      {/* Raffles */}
      {raffles.length > 0 && (
        <Section title={t("secRaffles")} count={raffles.length}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {raffles.map((e) => (
              <RaffleCard
                key={e.id}
                event={e}
                now={now}
                isAuthenticated={isAuthenticated}
                myTickets={userTickets[e.id] ?? 0}
                userTokens={userTokens}
                busy={busyId === e.id || pending}
                onBuy={(count) => buyTickets(e.id, count)}
              />
            ))}
          </div>
        </Section>
      )}

      {/* Contests */}
      {contests.length > 0 && (
        <Section title={t("secContests")} count={contests.length}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {contests.map((e) => (
              <ContestCard
                key={e.id}
                event={e}
                now={now}
                isAuthenticated={isAuthenticated}
                joined={entriesSet.has(e.id)}
                busy={busyId === e.id || pending}
                onJoin={() => joinEvent(e.id)}
              />
            ))}
          </div>
        </Section>
      )}

      {/* Toast */}
      {toast && (
        <div
          className={cn(
            "fixed bottom-6 end-6 z-50 max-w-md border px-4 py-3 flex items-center gap-3 shadow-2xl",
            toast.kind === "ok"
              ? "border-green-700 bg-green-950/90 text-green-200"
              : "border-red-700 bg-red-950/90 text-red-200",
          )}
        >
          {toast.kind === "ok" ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
          <span className="text-sm">{toast.msg}</span>
        </div>
      )}
    </div>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  const t = useTranslations("events");
  return (
    <div>
      <div className="flex items-baseline gap-2 mb-3">
        <h2 className="font-display text-2xl text-white tracking-wider">{title.toUpperCase()}</h2>
        <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">{t("activeCount", { count })}</span>
      </div>
      {children}
    </div>
  );
}

function formatCountdown(target: string | null, now: number, endedLabel: string): string {
  if (!target) return "—";
  const ms = new Date(target).getTime() - now;
  if (ms <= 0) return endedLabel;
  const days = Math.floor(ms / 86_400_000);
  const h = Math.floor((ms % 86_400_000) / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1_000);
  if (days > 0) return `${days}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}

function HappyHourBanner({ event, now }: { event: EventData; now: number }) {
  const t = useTranslations("events");
  const startsIn = event.startsAt ? new Date(event.startsAt).getTime() - now : 0;
  const isActive = startsIn <= 0 && (!event.endsAt || new Date(event.endsAt).getTime() > now);
  const countdown = isActive
    ? formatCountdown(event.endsAt, now, t("ended"))
    : formatCountdown(event.startsAt, now, t("ended"));
  const meta = TYPE_META.happy_hour;

  return (
    <div
      className={cn("relative overflow-hidden border-2 p-5 sm:p-6", meta.border, meta.bg)}
      style={{
        clipPath:
          "polygon(0 0, calc(100% - 16px) 0, 100% 16px, 100% 100%, 16px 100%, 0 calc(100% - 16px))",
      }}
    >
      <div className="absolute top-0 end-0 px-3 py-1 text-[9px] font-bold tracking-widest uppercase text-white"
        style={{ background: meta.color }}>
        {isActive ? t("hhLive") : t("hhSoon")}
      </div>
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="shrink-0">
          <div
            className="w-16 h-16 flex items-center justify-center"
            style={{ background: meta.color }}
          >
            <Zap className="w-8 h-8 text-white" strokeWidth={2.5} />
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-3 flex-wrap">
            <h3 className="font-display text-2xl sm:text-3xl text-white tracking-wider">
              {event.name}
            </h3>
            {event.multiplier && (
              <span
                className="font-display text-4xl tracking-wider"
                style={{ color: meta.color }}
              >
                ×{event.multiplier}
              </span>
            )}
          </div>
          {event.description && (
            <p className="text-zinc-300 text-sm mt-1">{event.description}</p>
          )}
        </div>
        <div className="text-end">
          <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-400 mb-1">
            {isActive ? t("hhEndsIn") : t("hhStartsIn")}
          </div>
          <div className="font-mono text-2xl text-white tabular-nums">{countdown}</div>
        </div>
      </div>
    </div>
  );
}

function WinnersBanner({ event }: { event: EventData }) {
  const t = useTranslations("events");
  return (
    <div className="mt-auto border-2 border-yellow-600 bg-linear-to-br from-yellow-950/40 to-amber-950/30 p-3">
      <div className="flex items-center gap-2 mb-2">
        <Crown className="w-4 h-4 text-yellow-400" />
        <span className="text-[10px] font-bold tracking-widest uppercase text-yellow-300">
          {t("winnersDrawn", { count: event.winners.length })}
        </span>
      </div>
      {event.winners.length === 0 ? (
        <p className="text-xs text-zinc-500 italic">{t("noWinners")}</p>
      ) : (
        <ul className="space-y-1.5">
          {event.winners.map((w) => (
            <li key={w.id} className="flex items-center gap-2">
              {w.image ? (
                <img src={w.image} alt="" width={24} height={24} loading="lazy" decoding="async" referrerPolicy="no-referrer" className="w-6 h-6 object-cover border border-yellow-700" />
              ) : (
                <img src="/brand/skull.png" alt="" className="w-6 h-6 border border-yellow-700 object-cover bg-black" />
              )}
              <div className="flex-1 min-w-0">
                <div className="text-sm text-white font-medium truncate">
                  {displayNick(w.displayName, w.username)}
                </div>
                {w.username && displayNick(w.displayName, w.username) !== w.username && (
                  <div className="text-[10px] font-mono text-zinc-500 truncate">
                    @{w.username}
                  </div>
                )}
              </div>
              <Trophy className="w-3.5 h-3.5 text-yellow-400 shrink-0" />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EventBase({
  event, badge, children,
}: { event: EventData; badge: React.ReactNode; children: React.ReactNode }) {
  const t = useTranslations("events");
  const meta = TYPE_META[event.type] ?? TYPE_META.giveaway;
  const Icon = meta.icon;
  const label = t(TYPE_LABEL_KEY[event.type] ?? "typeGiveaway");
  return (
    <div
      className={cn("border bg-zinc-950/80 backdrop-blur-xs p-5 flex flex-col", meta.border)}
      style={{
        clipPath:
          "polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 12px 100%, 0 calc(100% - 12px))",
      }}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4" style={{ color: meta.color }} />
          <span
            className="text-[10px] font-bold tracking-widest uppercase"
            style={{ color: meta.color }}
          >
            {label}
          </span>
        </div>
        {badge}
      </div>
      <h3 className="font-display text-xl text-white tracking-wide mb-2">{event.name}</h3>
      {event.description && (
        <p className="text-zinc-400 text-xs leading-relaxed mb-3">{event.description}</p>
      )}
      {children}
    </div>
  );
}

function GiveawayCard({
  event, now, isAuthenticated, joined, busy, onJoin,
}: {
  event: EventData; now: number; isAuthenticated: boolean;
  joined: boolean; busy: boolean; onJoin: () => void;
}) {
  const t = useTranslations("events");
  const fmt = useLocaleFmt();
  const countdown = formatCountdown(event.endsAt, now, t("ended"));
  const ended = event.endsAt && new Date(event.endsAt).getTime() <= now;
  const drawn = !!event.drawnAt;

  return (
    <EventBase
      event={event}
      badge={
        <span
          className={cn(
            "text-[10px] font-mono uppercase tracking-widest",
            drawn ? "text-yellow-400" : "text-zinc-500",
          )}
        >
          {drawn ? t("drawnBadge") : ended ? t("endedBadge") : countdown}
        </span>
      }
    >
      {event.prize && (
        <div className="border border-zinc-800 bg-black/30 p-3 mb-3">
          <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-1">
            {t("prize")}
          </div>
          <div className="text-sm text-white font-bold">🎁 {event.prize}</div>
          {event.winnersCount && event.winnersCount > 1 && (
            <div className="text-[10px] text-zinc-500 mt-1">
              {t("winnersCount", { count: event.winnersCount })}
            </div>
          )}
        </div>
      )}

      {event.requirement && !drawn && (
        <div className="text-[10px] font-mono uppercase tracking-widest text-purple-400 mb-3">
          🔒 {event.requirement}
        </div>
      )}

      {drawn ? (
        <WinnersBanner event={event} />
      ) : (
        <div className="flex items-center justify-between gap-3 mt-auto pt-3 border-t border-zinc-900">
          <div className="flex items-center gap-1.5 text-zinc-500 text-xs">
            <Users className="w-3.5 h-3.5" />
            <span>{t("participants", { count: fmt(event.entriesCount) })}</span>
          </div>
          {!isAuthenticated ? (
            <button
              onClick={() => signIn()}
              className="px-3 py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-300 text-[10px] font-bold tracking-widest uppercase"
            >
              {t("login")}
            </button>
          ) : ended ? (
            <button disabled className="px-3 py-2 bg-zinc-900 border border-zinc-800 text-zinc-500 text-[10px] font-bold tracking-widest uppercase cursor-not-allowed">
              {t("endedBtn")}
            </button>
          ) : joined ? (
            <button disabled className="px-3 py-2 bg-emerald-950 border border-emerald-700 text-emerald-300 text-[10px] font-bold tracking-widest uppercase flex items-center gap-1.5">
              <Check className="w-3 h-3" /> {t("joinedBtn")}
            </button>
          ) : (
            <button
              onClick={onJoin}
              disabled={busy}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold tracking-widest uppercase disabled:opacity-50 flex items-center gap-1.5"
            >
              {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Gift className="w-3 h-3" />}
              {t("joinBtn")}
            </button>
          )}
        </div>
      )}
    </EventBase>
  );
}

function ContestCard({
  event, now, isAuthenticated, joined, busy, onJoin,
}: {
  event: EventData; now: number; isAuthenticated: boolean;
  joined: boolean; busy: boolean; onJoin: () => void;
}) {
  const t = useTranslations("events");
  const fmt = useLocaleFmt();
  const countdown = formatCountdown(event.endsAt, now, t("ended"));
  const ended = event.endsAt && new Date(event.endsAt).getTime() <= now;
  const drawn = !!event.drawnAt;

  return (
    <EventBase
      event={event}
      badge={
        <span
          className={cn(
            "text-[10px] font-mono uppercase tracking-widest",
            drawn ? "text-yellow-400" : "text-zinc-500",
          )}
        >
          {drawn ? t("drawnBadge") : ended ? t("endedBadge") : countdown}
        </span>
      }
    >
      {event.prize && (
        <div className="border border-zinc-800 bg-black/30 p-3 mb-3">
          <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-1">
            {t("prizePool")}
          </div>
          <div className="text-xs text-white leading-relaxed whitespace-pre-line">
            🏆 {event.prize}
          </div>
        </div>
      )}

      {drawn ? (
        <WinnersBanner event={event} />
      ) : (
        <div className="flex items-center justify-between gap-3 mt-auto pt-3 border-t border-zinc-900">
          <div className="flex items-center gap-1.5 text-zinc-500 text-xs">
            <Users className="w-3.5 h-3.5" />
            <span>{t("submissions", { count: fmt(event.entriesCount) })}</span>
          </div>
          {!isAuthenticated ? (
            <button onClick={() => signIn()} className="px-3 py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-300 text-[10px] font-bold tracking-widest uppercase">
              {t("login")}
            </button>
          ) : ended ? (
            <button disabled className="px-3 py-2 bg-zinc-900 border border-zinc-800 text-zinc-500 text-[10px] font-bold tracking-widest uppercase cursor-not-allowed">
              {t("endedBtnM")}
            </button>
          ) : joined ? (
            <button disabled className="px-3 py-2 bg-blue-950 border border-blue-700 text-blue-300 text-[10px] font-bold tracking-widest uppercase flex items-center gap-1.5">
              <Check className="w-3 h-3" /> {t("submittedBtn")}
            </button>
          ) : (
            <button onClick={onJoin} disabled={busy} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-bold tracking-widest uppercase disabled:opacity-50 flex items-center gap-1.5">
              {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trophy className="w-3 h-3" />}
              {t("submitBtn")}
            </button>
          )}
        </div>
      )}
    </EventBase>
  );
}

function RaffleCard({
  event, now, isAuthenticated, myTickets, userTokens, busy, onBuy,
}: {
  event: EventData; now: number; isAuthenticated: boolean;
  myTickets: number; userTokens: number; busy: boolean; onBuy: (count: number) => void;
}) {
  const t = useTranslations("events");
  const fmt = useLocaleFmt();
  const [qty, setQty] = useState(1);
  const countdown = formatCountdown(event.endsAt, now, t("ended"));
  const ended = event.endsAt && new Date(event.endsAt).getTime() <= now;
  const price = event.ticketPrice ?? 0;
  const maxPerUser = event.maxTicketsPerUser ?? 999;
  const remaining = maxPerUser - myTickets;
  const totalCost = price * qty;
  const canAfford = userTokens >= totalCost;
  const canBuy = isAuthenticated && !ended && remaining > 0 && qty <= remaining && canAfford;

  const myChance = event.ticketsCount > 0 ? (myTickets / event.ticketsCount) * 100 : 0;
  const drawn = !!event.drawnAt;

  return (
    <EventBase
      event={event}
      badge={
        <span
          className={cn(
            "text-[10px] font-mono uppercase tracking-widest",
            drawn ? "text-yellow-400" : "text-zinc-500",
          )}
        >
          {drawn ? t("drawnBadge") : ended ? t("endedBadge") : countdown}
        </span>
      }
    >
      {event.prize && (
        <div className="border border-zinc-800 bg-black/30 p-3 mb-3">
          <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-1">
            {t("prize")}
          </div>
          <div className="text-sm text-white font-bold">🎯 {event.prize}</div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 mb-3 text-[10px] font-mono uppercase tracking-widest">
        <div className="border border-zinc-800 bg-black/30 p-2">
          <div className="text-zinc-500">{t("ticketPool")}</div>
          <div className="text-white text-base normal-case font-bold">{fmt(event.ticketsCount)}</div>
        </div>
        <div className="border border-zinc-800 bg-black/30 p-2">
          <div className="text-zinc-500">{t("yourTickets")}</div>
          <div className="text-white text-base normal-case font-bold">
            {fmt(myTickets)}{" "}
            {myTickets > 0 && (
              <span className="text-purple-400 text-xs">({myChance.toFixed(1)}%)</span>
            )}
          </div>
        </div>
      </div>

      {!drawn && (
        <div className="flex items-center justify-between gap-2 text-[10px] font-mono uppercase tracking-widest mb-3">
          <span className="text-zinc-500">{t("ticketPrice")}</span>
          <span className="text-white text-sm normal-case font-bold">{fmt(price)} GT</span>
        </div>
      )}

      {drawn ? (
        <WinnersBanner event={event} />
      ) : !isAuthenticated ? (
        <button
          onClick={() => signIn()}
          className="w-full px-3 py-2.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-300 text-[10px] font-bold tracking-widest uppercase mt-auto"
        >
          {t("loginToBuy")}
        </button>
      ) : ended ? (
        <div className="text-center text-zinc-500 text-xs py-2 mt-auto">{t("raffleEnded")}</div>
      ) : remaining <= 0 ? (
        <div className="text-center text-purple-400 text-xs py-2 mt-auto">
          {t("limitReached", { max: maxPerUser })}
        </div>
      ) : (
        <div className="mt-auto space-y-2">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setQty((q) => Math.max(1, q - 1))}
              disabled={qty <= 1}
              className="w-9 h-9 border border-zinc-800 hover:border-zinc-700 text-zinc-400 disabled:opacity-30 flex items-center justify-center"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <input
              type="number"
              min={1}
              max={remaining}
              value={qty}
              onChange={(e) => {
                const v = Math.max(1, Math.min(remaining, parseInt(e.target.value) || 1));
                setQty(v);
              }}
              className="flex-1 border border-zinc-800 bg-black/30 text-center text-white text-sm font-mono tabular-nums py-2 outline-hidden focus:border-purple-600"
            />
            <button
              onClick={() => setQty((q) => Math.min(remaining, q + 1))}
              disabled={qty >= remaining}
              className="w-9 h-9 border border-zinc-800 hover:border-zinc-700 text-zinc-400 disabled:opacity-30 flex items-center justify-center"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onBuy(qty)}
              disabled={busy || !canBuy}
              className={cn(
                "px-4 py-2 text-[10px] font-bold tracking-widest uppercase disabled:opacity-50 flex items-center gap-1.5",
                canBuy
                  ? "bg-purple-600 hover:bg-purple-500 text-white"
                  : "bg-zinc-900 border border-zinc-800 text-zinc-500 cursor-not-allowed",
              )}
            >
              {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Ticket className="w-3 h-3" />}
              {!canAfford ? t("notEnough") : t("buyQty", { qty })}
            </button>
          </div>
          <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-widest">
            <span className="text-zinc-500">
              {t("limitRemaining", { count: fmt(remaining) })}
            </span>
            <span className={canAfford ? "text-white" : "text-red-400"}>
              {t("cost", { cost: fmt(totalCost) })}
            </span>
          </div>
        </div>
      )}
    </EventBase>
  );
}
