"use client";
// src/components/schedule/ScheduleClient.tsx
// Public schedule: highlighted upcoming stream + countdown + weekly grid
import { useEffect, useState, useMemo } from "react";
import { Calendar, Clock, Sparkles } from "lucide-react";
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

const DAYS_FULL = ["Niedziela", "Poniedziałek", "Wtorek", "Środa", "Czwartek", "Piątek", "Sobota"];
const DAYS_SHORT = ["Nd", "Pn", "Wt", "Śr", "Cz", "Pt", "So"];

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

function formatCountdown(ms: number): string {
  if (ms <= 0) return "TERAZ LIVE";
  const d = Math.floor(ms / 86_400_000);
  const h = Math.floor((ms % 86_400_000) / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}

export function ScheduleClient({ slots }: { slots: Slot[] }) {
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

  return (
    <div className="space-y-6">
      {/* Live or countdown banner */}
      {isLive && nextSlot && currentEnd ? (
        <div
          className="border-2 border-red-500 bg-gradient-to-br from-red-950/40 to-red-900/20 p-5 sm:p-6 relative overflow-hidden"
          style={{
            clipPath:
              "polygon(0 0, calc(100% - 16px) 0, 100% 16px, 100% 100%, 16px 100%, 0 calc(100% - 16px))",
          }}
        >
          <div className="absolute top-0 right-0 px-3 py-1 text-[10px] font-bold tracking-widest uppercase text-white bg-red-600 animate-pulse">
            ● LIVE TERAZ
          </div>
          <div className="flex flex-col sm:flex-row items-center gap-4">
            <div className="text-5xl">🔴</div>
            <div className="flex-1 text-center sm:text-left">
              <div className="font-display text-2xl sm:text-3xl text-white tracking-wider">
                {nextSlot.title ?? "Stream trwa!"}
              </div>
              <div className="text-zinc-400 text-sm mt-1">
                Kończy się o {formatTime(currentEnd.getHours(), currentEnd.getMinutes())}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-400 mb-1">
                Pozostało
              </div>
              <div className="font-mono text-2xl text-white tabular-nums">
                {formatCountdown(currentEnd.getTime() - now.getTime())}
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
            Najbliższy stream
          </div>
          <div className="flex flex-col sm:flex-row items-center gap-4">
            <div className="flex-1 text-center sm:text-left">
              <div className="font-display text-2xl sm:text-3xl text-white tracking-wider mb-1">
                {nextSlot.title ?? `Stream — ${DAYS_FULL[nextSlot.dayOfWeek]}`}
              </div>
              <div className="text-zinc-400 text-sm">
                {DAYS_FULL[nextSlot.dayOfWeek]} o{" "}
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
                Za
              </div>
              <div className="font-mono text-2xl text-white tabular-nums">
                {formatCountdown(nextStart.getTime() - now.getTime())}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Weekly grid */}
      <div
        className="border border-zinc-800 bg-zinc-950/70 backdrop-blur-sm p-4"
        style={{
          clipPath:
            "polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 12px 100%, 0 calc(100% - 12px))",
        }}
      >
        <div className="flex items-center gap-2 mb-4">
          <Calendar className="w-4 h-4 text-red-500" />
          <h2 className="font-display text-lg text-white tracking-wider">TYDZIEŃ</h2>
        </div>

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
                  {DAYS_SHORT[dayIdx]}
                  {isToday && <span className="ml-1 text-[8px]">DZIŚ</span>}
                </div>

                {daySlots.length === 0 ? (
                  <div className="text-[10px] font-mono text-zinc-700 italic">
                    Wolne
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
      </div>

      {/* Footnote */}
      <p className="text-[10px] font-mono uppercase tracking-widest text-zinc-600 text-center">
        Harmonogram może się zmienić — sprawdź Discord po aktualne info
      </p>
    </div>
  );
}
