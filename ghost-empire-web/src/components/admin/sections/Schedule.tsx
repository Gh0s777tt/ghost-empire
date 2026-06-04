"use client";
// src/components/admin/sections/Schedule.tsx — lazily-loaded weekly stream schedule.
import { useState } from "react";
import { CalendarDays, Loader2, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { SectionCard, FieldInput } from "../shared";
import type { ScheduleSlot } from "../types";

const DAYS_PL_LONG = ["Niedziela", "Poniedziałek", "Wtorek", "Środa", "Czwartek", "Piątek", "Sobota"];

export function ScheduleManager({
  slots, onToast, onSuccess, pending,
}: {
  slots: ScheduleSlot[];
  onToast: (k: "ok" | "err", m: string) => void;
  onSuccess: () => void;
  pending: boolean;
}) {
  const [dayOfWeek, setDayOfWeek] = useState("1"); // Monday
  const [startHour, setStartHour] = useState("18");
  const [startMinute, setStartMinute] = useState("0");
  const [durationMinutes, setDurationMinutes] = useState("180");
  const [title, setTitle] = useState("");
  const [platform, setPlatform] = useState("");
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function addSlot() {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dayOfWeek: parseInt(dayOfWeek),
          startHour: parseInt(startHour),
          startMinute: parseInt(startMinute),
          durationMinutes: parseInt(durationMinutes),
          title: title || undefined,
          platform: platform || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) onToast("err", data.error ?? "Błąd");
      else {
        onToast("ok", "Slot dodany");
        setTitle("");
        onSuccess();
      }
    } finally { setBusy(false); }
  }

  async function deleteSlot(id: string) {
    if (!confirm("Usunąć ten slot?")) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/schedule?id=${id}`, { method: "DELETE" });
      if (res.ok) { onToast("ok", "Slot usunięty"); onSuccess(); }
      else onToast("err", "Błąd");
    } finally { setBusyId(null); }
  }

  async function toggleActive(slot: ScheduleSlot) {
    setBusyId(slot.id);
    try {
      const res = await fetch("/api/admin/schedule", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: slot.id, active: !slot.active }),
      });
      if (res.ok) { onSuccess(); }
    } finally { setBusyId(null); }
  }

  return (
    <SectionCard title={`Plan streamów (${slots.length} slot${slots.length === 1 ? "" : "ów"})`} icon={CalendarDays}>
      <p className="text-zinc-500 text-xs mb-3">
        Tygodniowy plan widoczny na <code className="text-red-400">/schedule</code>. Powtarza się co tydzień.
      </p>

      {/* New slot form */}
      <div className="border border-zinc-800 bg-black/30 p-3 mb-4 space-y-2">
        <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">Dodaj nowy slot</div>

        <div>
          <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-1">Dzień</label>
          <div className="grid grid-cols-7 gap-1">
            {[1, 2, 3, 4, 5, 6, 0].map((d) => (
              <button
                key={d}
                onClick={() => setDayOfWeek(d.toString())}
                className={cn(
                  "px-1 py-1.5 border text-[10px] font-bold tracking-widest uppercase",
                  dayOfWeek === d.toString()
                    ? "border-red-500 bg-red-600/20 text-red-300"
                    : "border-zinc-800 bg-zinc-950 text-zinc-500 hover:text-zinc-300",
                )}
              >
                {DAYS_PL_LONG[d].slice(0, 2)}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <FieldInput label="Godzina" value={startHour} onChange={setStartHour} type="number" placeholder="18" />
          <FieldInput label="Minuta" value={startMinute} onChange={setStartMinute} type="number" placeholder="0" />
          <FieldInput label="Czas trwania (min)" value={durationMinutes} onChange={setDurationMinutes} type="number" />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <FieldInput label="Nazwa (opc.)" value={title} onChange={setTitle} placeholder="np. Just chatting" />
          <FieldInput label="Platforma (opc.)" value={platform} onChange={setPlatform} placeholder="twitch / kick" />
        </div>

        <button
          onClick={addSlot}
          disabled={busy || pending}
          className="w-full px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-[10px] font-bold tracking-widest uppercase disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
          Dodaj slot
        </button>
      </div>

      {/* Existing slots list */}
      {slots.length > 0 ? (
        <div className="space-y-1.5">
          {slots.map((s) => (
            <div
              key={s.id}
              className={cn(
                "flex items-center gap-3 border px-3 py-2",
                s.active ? "border-zinc-800 bg-black/30" : "border-zinc-900 bg-zinc-950/60 opacity-50",
              )}
            >
              <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 w-24">
                {DAYS_PL_LONG[s.dayOfWeek]}
              </span>
              <span className="font-mono text-sm text-white">
                {s.startHour.toString().padStart(2, "0")}:{s.startMinute.toString().padStart(2, "0")}
              </span>
              <span className="text-[10px] text-zinc-500">~{Math.round(s.durationMinutes / 60)}h</span>
              <div className="flex-1 min-w-0">
                {s.title && <div className="text-xs text-white truncate">{s.title}</div>}
                {s.platform && <div className="text-[10px] text-zinc-500 uppercase">{s.platform}</div>}
              </div>
              <button
                onClick={() => toggleActive(s)}
                disabled={busyId === s.id || pending}
                className={cn(
                  "px-2 py-1.5 border text-[10px] font-bold tracking-widest uppercase",
                  s.active ? "border-green-700 text-green-300" : "border-zinc-700 text-zinc-500",
                )}
              >
                {s.active ? "ON" : "OFF"}
              </button>
              <button
                onClick={() => deleteSlot(s.id)}
                disabled={busyId === s.id || pending}
                className="text-zinc-500 hover:text-red-400"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-zinc-500 text-sm">Brak slotów. Dodaj pierwszy powyżej.</p>
      )}
    </SectionCard>
  );
}
