"use client";
// src/components/schedule/ScheduleClient.tsx
// Public schedule: highlighted upcoming stream + countdown + weekly grid
import { useEffect, useState, useMemo } from "react";
import { useTranslations } from "next-intl";
import { Calendar, Clock, Sparkles, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

type Slot = {
  id: string;
  dayOfWeek: number; // 0=Sun ... 6=Sat
  dayName: string;
  startHour: number;
  startMinute: number;
  durationMinutes: number;
  title: string | null;
  platform: string | null;
};

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function formatTime(h: number, m: number) {
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

/**
 * Compute the next occurrence of a recurring weekly slot relative to `from`.
 */
function nextOccurrence(slot: Slot, from: Date): Date {
  const result = new Date(from);
  result.setSeconds(0, 0);
  // Iterate up to 7 days to find next occurrence
  for (let i = 0; i < 8; i++) {
    const candidate = new Date(result);
    candidate.setDate(result.getDate() + i);
    candidate.setHours(slot.startHour, slot.startMinute, 0, 0);
    if (candidate.getDay() === slot.dayOfWeek && candidate >= from) {
      return candidate;
    }
  }
  return result;
}

function formatCountdown(ms: number, nowLiveLabel: string): string {
  if (ms <= 0) return nowLiveLabel;
  const d = Math.floor(ms / 86_400_000);
  const h = Math.floor((ms % 86_400_000) / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}

export function ScheduleClient({ slots }: { slots: Slot[] }) {
  const t = useTranslations("schedule");
  const daysFull = t.raw("daysFull") as string[];
  const daysShort = t.raw("daysShort") as string[];
  const months = t.raw("months") as string[];
  // Monday-first column headers for the month calendar (reorder Sunday-first short days).
  const dowHeaders = [1, 2, 3, 4, 5, 6, 0].map((i) => daysShort[i]);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Compute next stream + is currently live
  const { nextSlot, nextStart, isLive, currentEnd } = useMemo(() => {
    if (slots.length === 0) {
      return { nextSlot: null, nextStart: null, isLive: false, currentEnd: null };
    }
    // Find slot we're currently inside, if any
    let liveSlot: Slot | null = null;
    let liveEnd: Date | null = null;
    for (const slot of slots) {
      const startThisOccurrence = new Date(now);
      startThisOccurrence.setHours(slot.startHour, slot.startMinute, 0, 0);
      if (now.getDay() === slot.dayOfWeek && now >= startThisOccurrence) {
        const end = new Date(startThisOccurrence.getTime() + slot.durationMinutes * 60_000);
        if (now < end) {
          liveSlot = slot;
          liveEnd = end;
          break;
        }
      }
    }

    // Find next slot
    let nextSlot: Slot | null = null;
    let nextStart: Date | null = null;
    for (const slot of slots) {
      const occ = nextOccurrence(slot, now);
      if (!nextStart || occ < nextStart) {
        nextStart = occ;
        nextSlot = slot;
      }
    }

    return {
      nextSlot,
      nextStart,
      isLive: !!liveSlot,
      currentEnd: liveEnd,
    };
  }, [slots, now]);

  // Group slots by day
  const slotsByDay = useMemo(() => {
    const map: Record<number, Slot[]> = {};
    for (let i = 0; i < 7; i++) map[i] = [];
    for (const s of slots) map[s.dayOfWeek].push(s);
    return map;
  }, [slots]);

  // Week / month view toggle + the displayed month (1st of month, midnight).
  const [view, setView] = useState<"week" | "month">("week");
  const [monthCursor, setMonthCursor] = useState(() => {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  });

  // Build a Monday-first 6×7 calendar grid for the current month cursor. Slots are
  // weekly-recurring, so every cell shows the slots for its day-of-week.
  const monthGrid = useMemo(() => {
    const year = monthCursor.getFullYear();
    const month = monthCursor.getMonth();
    const start = new Date(year, month, 1);
    const mondayOffset = (start.getDay() + 6) % 7; // 0=Mon … 6=Sun
    start.setDate(start.getDate() - mondayOffset);
    const weeks: Date[][] = [];
    const cur = new Date(start);
    for (let w = 0; w < 6; w++) {
      const week: Date[] = [];
      for (let d = 0; d < 7; d++) {
        week.push(new Date(cur));
        cur.setDate(cur.getDate() + 1);
      }
      weeks.push(week);
    }
    return { weeks, year, month };
  }, [monthCursor]);

  function shiftMonth(delta: number) {
    setMonthCursor((c) => new Date(c.getFullYear(), c.getMonth() + delta, 1));
  }
  function resetMonth() {
    const d = new Date();
    setMonthCursor(new Date(d.getFullYear(), d.getMonth(), 1));
  }

  return (
    <div className="space-y-6">
      {/* Live or countdown banner */}
      {isLive && nextSlot && currentEnd ? (
        <div
          className="border-2 border-red-500 bg-linear-to-br from-red-950/40 to-red-900/20 p-5 sm:p-6 relative overflow-hidden"
          style={{
            clipPath:
              "polygon(0 0, calc(100% - 16px) 0, 100% 16px, 100% 100%, 16px 100%, 0 calc(100% - 16px))",
          }}
        >
          <div className="absolute top-0 right-0 px-3 py-1 text-[10px] font-bold tracking-widest uppercase text-white bg-red-600 animate-pulse">
            {t("liveNow")}
          </div>
          <div className="flex flex-col sm:flex-row items-center gap-4">
            <div className="text-5xl">🔴</div>
            <div className="flex-1 text-center sm:text-left">
              <div className="font-display text-2xl sm:text-3xl text-white tracking-wider">
                {nextSlot.title ?? t("streamOn")}
              </div>
              <div className="text-zinc-400 text-sm mt-1">
                {t("endsAt", { time: formatTime(currentEnd.getHours(), currentEnd.getMinutes()) })}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-400 mb-1">
                {t("remaining")}
              </div>
              <div className="font-mono text-2xl text-white tabular-nums">
                {formatCountdown(currentEnd.getTime() - now.getTime(), t("nowLive"))}
              </div>
            </div>
          </div>
        </div>
      ) : nextSlot && nextStart ? (
        <div
          className="border-2 border-zinc-800 bg-zinc-950/80 p-5 sm:p-6 relative"
          style={{
            clipPath:
              "polygon(0 0, calc(100% - 16px) 0, 100% 16px, 100% 100%, 16px 100%, 0 calc(100% - 16px))",
          }}
        >
          <div className="flex items-center gap-2 mb-3 text-[10px] font-mono uppercase tracking-widest text-zinc-500">
            <Sparkles className="w-3 h-3" />
            {t("nextStream")}
          </div>
          <div className="flex flex-col sm:flex-row items-center gap-4">
            <div className="flex-1 text-center sm:text-left">
              <div className="font-display text-2xl sm:text-3xl text-white tracking-wider mb-1">
                {nextSlot.title ?? t("streamDay", { day: daysFull[nextSlot.dayOfWeek] })}
              </div>
              <div className="text-zinc-400 text-sm">
                {daysFull[nextSlot.dayOfWeek]} {t("at")}{" "}
                <span className="text-red-400 font-mono">
                  {formatTime(nextSlot.startHour, nextSlot.startMinute)}
                </span>
                {nextSlot.platform && (
                  <>
                    {" · "}
                    <span className="text-zinc-500">{nextSlot.platform}</span>
                  </>
                )}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-1">
                {t("inLabel")}
              </div>
              <div className="font-mono text-2xl text-white tabular-nums">
                {formatCountdown(nextStart.getTime() - now.getTime(), t("nowLive"))}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Weekly grid */}
      <div
        className="border border-zinc-800 bg-zinc-950/70 backdrop-blur-xs p-4"
        style={{
          clipPath:
            "polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 12px 100%, 0 calc(100% - 12px))",
        }}
      >
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <Calendar className="w-4 h-4 text-red-500" />
          <h2 className="font-display text-lg text-white tracking-wider">
            {view === "week" ? t("weekUpper") : `${months[monthGrid.month]} ${monthGrid.year}`}
          </h2>
          {view === "month" && (
            <div className="flex items-center gap-1 ml-2">
              <button onClick={() => shiftMonth(-1)} aria-label={t("prevMonth")} className="w-7 h-7 flex items-center justify-center border border-zinc-800 hover:border-zinc-600 text-zinc-400 hover:text-white transition-colors">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button onClick={resetMonth} className="px-2 h-7 text-[10px] font-mono uppercase tracking-widest border border-zinc-800 hover:border-zinc-600 text-zinc-400 hover:text-white transition-colors">
                {t("today")}
              </button>
              <button onClick={() => shiftMonth(1)} aria-label={t("nextMonth")} className="w-7 h-7 flex items-center justify-center border border-zinc-800 hover:border-zinc-600 text-zinc-400 hover:text-white transition-colors">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
          <div className="ml-auto inline-flex border border-zinc-800" role="tablist" aria-label={t("viewLabel")}>
            {(["week", "month"] as const).map((v) => (
              <button
                key={v}
                role="tab"
                aria-selected={view === v}
                onClick={() => setView(v)}
                className={cn(
                  "px-3 py-1 text-[10px] font-mono uppercase tracking-widest transition-colors",
                  view === v ? "bg-red-600 text-white" : "text-zinc-400 hover:text-white",
                )}
              >
                {v === "week" ? t("weekTab") : t("monthTab")}
              </button>
            ))}
          </div>
        </div>

        {view === "week" ? (
        <div className="grid grid-cols-1 sm:grid-cols-7 gap-2">
          {[1, 2, 3, 4, 5, 6, 0].map((dayIdx) => {
            const isToday = now.getDay() === dayIdx;
            const daySlots = slotsByDay[dayIdx];
            return (
              <div
                key={dayIdx}
                className={cn(
                  "border p-2 min-h-[100px]",
                  isToday
                    ? "border-red-700 bg-red-950/20"
                    : daySlots.length === 0
                      ? "border-zinc-900 bg-black/20"
                      : "border-zinc-800 bg-black/30",
                )}
              >
                <div
                  className={cn(
                    "text-[10px] font-mono uppercase tracking-widest mb-2 pb-1 border-b",
                    isToday ? "text-red-300 border-red-900" : "text-zinc-500 border-zinc-800",
                  )}
                >
                  {daysShort[dayIdx]}
                  {isToday && <span className="ml-1 text-[8px]">{t("todayBadge")}</span>}
                </div>

                {daySlots.length === 0 ? (
                  <div className="text-[10px] font-mono text-zinc-700 italic">
                    {t("free")}
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {daySlots.map((s) => (
                      <div
                        key={s.id}
                        className="border-l-2 border-red-700 pl-1.5 py-0.5"
                      >
                        <div className="font-mono text-xs text-white">
                          {formatTime(s.startHour, s.startMinute)}
                        </div>
                        {s.title && (
                          <div className="text-[10px] text-zinc-400 leading-tight">{s.title}</div>
                        )}
                        <div className="text-[9px] text-zinc-600">
                          ~{Math.round(s.durationMinutes / 60)}h
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        ) : (
          <div>
            {/* Weekday column headers (Monday-first) */}
            <div className="hidden sm:grid grid-cols-7 gap-2 mb-2">
              {dowHeaders.map((h) => (
                <div key={h} className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 text-center">{h}</div>
              ))}
            </div>
            {/* 6-week calendar grid; recurring weekly slots projected onto each date */}
            <div className="space-y-1 sm:space-y-2">
              {monthGrid.weeks.map((week, wi) => (
                <div key={wi} className="grid grid-cols-7 gap-1 sm:gap-2">
                  {week.map((date) => {
                    const inMonth = date.getMonth() === monthGrid.month;
                    const isToday = sameDay(date, now);
                    const daySlots = slotsByDay[date.getDay()];
                    return (
                      <div
                        key={date.toISOString()}
                        className={cn(
                          "border p-1 sm:p-1.5 min-h-[58px] sm:min-h-[84px] overflow-hidden",
                          isToday
                            ? "border-red-700 bg-red-950/20"
                            : !inMonth
                              ? "border-zinc-900/60 bg-black/10 opacity-40"
                              : daySlots.length === 0
                                ? "border-zinc-900 bg-black/20"
                                : "border-zinc-800 bg-black/30",
                        )}
                      >
                        <div className={cn(
                          "text-[10px] font-mono mb-1",
                          isToday ? "text-red-300 font-bold" : inMonth ? "text-zinc-400" : "text-zinc-700",
                        )}>
                          {date.getDate()}
                        </div>
                        <div className="space-y-0.5">
                          {daySlots.slice(0, 3).map((s) => (
                            <div
                              key={s.id}
                              className="text-[9px] font-mono text-white bg-red-900/30 border-l border-red-700 px-1 truncate leading-tight"
                              title={s.title ?? undefined}
                            >
                              {formatTime(s.startHour, s.startMinute)}{s.title ? ` ${s.title}` : ""}
                            </div>
                          ))}
                          {daySlots.length > 3 && (
                            <div className="text-[8px] font-mono text-zinc-500">{t("more", { count: daySlots.length - 3 })}</div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footnote */}
      <p className="text-[10px] font-mono uppercase tracking-widest text-zinc-600 text-center">
        {t("footnote")}
      </p>
    </div>
  );
}
