"use client";
// src/components/admin/sections/Events.tsx — lazily-loaded events cluster:
// holiday templates, create-event form, and the active-events manager + editor.
import { useState } from "react";
import { Calendar, Loader2, Zap, Plus, Dice5, Eye, EyeOff, Pencil, X, Check } from "lucide-react";
import { cn, formatDate } from "@/lib/utils";
import { SectionCard, FieldInput, FieldTextarea } from "../shared";
import type { EventRow } from "../types";

type HolidayTemplate = {
  key: string;
  emoji: string;
  label: string;
  payload: {
    type: "happy_hour" | "giveaway";
    name: string;
    description: string;
    durationMinutes: number;
    multiplier?: number;
    prize?: string;
    winnersCount?: number;
    requirement?: string;
  };
};

const HOLIDAY_TEMPLATES: HolidayTemplate[] = [
  { key: "womens_day", emoji: "💃", label: "Dzień Kobiet",
    payload: { type: "happy_hour", name: "💃 Dzień Kobiet — x2 GT!", description: "Z okazji Dnia Kobiet wszystkie Ghost Tokens lecą podwójnie!", durationMinutes: 1440, multiplier: 2 } },
  { key: "valentines", emoji: "❤️", label: "Walentynki",
    payload: { type: "happy_hour", name: "❤️ Walentynki — x2 GT!", description: "Pokochaj farmienie tokenów — dziś podwójnie!", durationMinutes: 1440, multiplier: 2 } },
  { key: "easter", emoji: "🐰", label: "Wielkanoc",
    payload: { type: "giveaway", name: "🐰 Wielkanocne jajo", description: "Świąteczny giveaway — losujemy zwycięzców spośród aktywnych!", durationMinutes: 2880, prize: "Niespodzianka świąteczna", winnersCount: 3, requirement: "Bądź aktywny na czacie" } },
  { key: "halloween", emoji: "🎃", label: "Halloween",
    payload: { type: "happy_hour", name: "🎃 Halloween — x3 GT!", description: "Straszna noc — potrójne tokeny dla wszystkich!", durationMinutes: 1440, multiplier: 3 } },
  { key: "christmas", emoji: "🎄", label: "Boże Narodzenie",
    payload: { type: "giveaway", name: "🎄 Świąteczny giveaway", description: "Pod choinką czeka nagroda — dołącz do eventu!", durationMinutes: 4320, prize: "Świąteczna nagroda", winnersCount: 5, requirement: "Dołącz do eventu" } },
  { key: "nye", emoji: "🎆", label: "Sylwester / Nowy Rok",
    payload: { type: "happy_hour", name: "🎆 Sylwester — x2.5 GT!", description: "Witamy Nowy Rok z bonusem do tokenów!", durationMinutes: 720, multiplier: 2.5 } },
];

export function HolidayEventsCard({
  onToast, onSuccess, pending,
}: {
  onToast: (k: "ok" | "err", m: string) => void;
  onSuccess: () => void;
  pending: boolean;
}) {
  const [busy, setBusy] = useState<string | null>(null);

  async function launch(t: HolidayTemplate) {
    setBusy(t.key);
    try {
      const res = await fetch("/api/admin/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...t.payload, startsInMinutes: 0 }),
      });
      const data = await res.json();
      if (!res.ok) onToast("err", data.error ?? "Błąd");
      else { onToast("ok", `Event „${t.label}" odpalony!`); onSuccess(); }
    } catch {
      onToast("err", "Błąd sieci");
    } finally {
      setBusy(null);
    }
  }

  return (
    <SectionCard title="Eventy okolicznościowe (szablony)" icon={Calendar}>
      <p className="text-xs text-zinc-500 mb-3 leading-relaxed">
        Odpal gotowy event świąteczny <strong className="text-zinc-300">jednym kliknięciem</strong> — tworzy aktywny event od teraz
        (happy hour = bonus mnożnik do GT, giveaway = losowanie nagrody). Szczegóły zmienisz / zakończysz go niżej w „aktywnych eventach".
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {HOLIDAY_TEMPLATES.map((t) => (
          <div key={t.key} className="border border-zinc-800 bg-zinc-950 p-3 flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <span className="text-2xl">{t.emoji}</span>
              <div className="min-w-0">
                <div className="text-sm font-bold text-white truncate">{t.label}</div>
                <div className="text-[10px] font-mono text-zinc-500">
                  {t.payload.type === "happy_hour" ? `happy hour ×${t.payload.multiplier}` : "giveaway"} · {Math.round(t.payload.durationMinutes / 60)}h
                </div>
              </div>
            </div>
            <p className="text-[11px] text-zinc-500 leading-snug flex-1">{t.payload.description}</p>
            <button
              onClick={() => launch(t)}
              disabled={busy !== null || pending}
              className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white text-[10px] font-bold tracking-widest uppercase transition-all disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              {busy === t.key ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
              Odpal teraz
            </button>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

export function CreateEventCard({
  onToast, onSuccess, pending,
}: {
  onToast: (k: "ok" | "err", m: string) => void;
  onSuccess: () => void;
  pending: boolean;
}) {
  const [type, setType] = useState<"giveaway" | "raffle" | "contest" | "happy_hour">("giveaway");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [prize, setPrize] = useState("");
  const [winnersCount, setWinnersCount] = useState("1");
  const [requirement, setRequirement] = useState("");
  const [multiplier, setMultiplier] = useState("2");
  const [ticketPrice, setTicketPrice] = useState("500");
  const [maxTicketsPerUser, setMaxTicketsPerUser] = useState("20");
  const [startsInMinutes, setStartsInMinutes] = useState("0");
  const [durationMinutes, setDurationMinutes] = useState("60");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      const body: Record<string, unknown> = {
        type, name, description: description || undefined,
        startsInMinutes: parseInt(startsInMinutes),
        durationMinutes: parseInt(durationMinutes),
      };
      if (type === "happy_hour") {
        body.multiplier = parseFloat(multiplier);
      } else {
        body.prize = prize;
        body.winnersCount = parseInt(winnersCount);
        if (type === "giveaway") body.requirement = requirement || undefined;
        if (type === "raffle") {
          body.ticketPrice = parseInt(ticketPrice);
          body.maxTicketsPerUser = parseInt(maxTicketsPerUser);
        }
      }
      const res = await fetch("/api/admin/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        onToast("err", data.error ?? "Błąd");
      } else {
        onToast("ok", `Event utworzony: ${data.event.name}`);
        setName(""); setDescription(""); setPrize(""); setRequirement("");
        onSuccess();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <SectionCard title="Nowy event" icon={Calendar}>
      <div className="space-y-3">
        {/* Type selector */}
        <div>
          <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-1">
            Typ
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1">
            {(["giveaway", "raffle", "contest", "happy_hour"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setType(t)}
                className={cn(
                  "px-2 py-1.5 border text-[10px] font-bold tracking-widest uppercase",
                  type === t
                    ? "border-red-500 bg-red-600/20 text-red-300"
                    : "border-zinc-800 bg-zinc-950 text-zinc-500 hover:text-zinc-300",
                )}
              >
                {t.replace("_", " ")}
              </button>
            ))}
          </div>
        </div>

        <FieldInput label="Nazwa" value={name} onChange={setName} placeholder="np. GIVEAWAY: Klucz CS2" />
        <FieldTextarea label="Opis (opcjonalnie)" value={description} onChange={setDescription} />

        {type !== "happy_hour" && (
          <FieldInput label="Nagroda" value={prize} onChange={setPrize} placeholder="np. AK-47 Asiimov" />
        )}

        {(type === "giveaway" || type === "raffle" || type === "contest") && (
          <FieldInput label="Liczba zwycięzców" value={winnersCount} onChange={setWinnersCount} type="number" />
        )}
        {type === "giveaway" && (
          <FieldInput
            label="Wymóg (np. 'sub Twitch')"
            value={requirement}
            onChange={setRequirement}
            placeholder="Aktywny subskrybent"
          />
        )}
        {type === "happy_hour" && (
          <FieldInput label="Multiplier" value={multiplier} onChange={setMultiplier} type="number" placeholder="np. 2 lub 1.5" />
        )}
        {type === "raffle" && (
          <div className="grid grid-cols-2 gap-2">
            <FieldInput label="Cena biletu (GT)" value={ticketPrice} onChange={setTicketPrice} type="number" />
            <FieldInput label="Max biletów / user" value={maxTicketsPerUser} onChange={setMaxTicketsPerUser} type="number" />
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <FieldInput label="Start za (min)" value={startsInMinutes} onChange={setStartsInMinutes} type="number" />
          <FieldInput label="Trwa (min)" value={durationMinutes} onChange={setDurationMinutes} type="number" />
        </div>

        <button
          onClick={submit}
          disabled={busy || pending || !name || (type !== "happy_hour" && !prize)}
          className="w-full px-4 py-2.5 bg-red-600 hover:bg-red-500 text-white text-xs font-bold tracking-widest uppercase transition-all disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
          Stwórz event
        </button>
      </div>
    </SectionCard>
  );
}

export function EventsManager({
  events, canEdit, canDraw, onToast, onSuccess, pending,
}: {
  events: EventRow[];
  canEdit: boolean;
  canDraw: boolean;
  onToast: (k: "ok" | "err", m: string) => void;
  onSuccess: () => void;
  pending: boolean;
}) {
  const [editing, setEditing] = useState<EventRow | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [drawingId, setDrawingId] = useState<string | null>(null);

  async function toggleActive(e: EventRow) {
    setBusyId(e.id);
    try {
      const res = await fetch("/api/admin/events", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: e.id, active: !e.active }),
      });
      if (res.ok) {
        onToast("ok", e.active ? `Event "${e.name}" dezaktywowany` : `Event "${e.name}" aktywowany`);
        onSuccess();
      } else {
        const data = await res.json();
        onToast("err", data.error ?? "Błąd");
      }
    } finally { setBusyId(null); }
  }

  async function draw(id: string, name: string) {
    if (!confirm(`Wylosować zwycięzców dla "${name}"? Tej operacji nie da się cofnąć.`)) return;
    setDrawingId(id);
    try {
      const res = await fetch("/api/admin/events/draw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId: id }),
      });
      const data = await res.json();
      if (!res.ok) {
        onToast("err", data.error ?? "Błąd losowania");
      } else {
        const names = data.winners
          .map((w: { username: string | null; displayName: string | null }) =>
            w.displayName ?? w.username ?? "Anonim",
          )
          .join(", ");
        onToast("ok", `Wylosowano ${data.actualWinners}: ${names}`);
        onSuccess();
      }
    } finally {
      setDrawingId(null);
    }
  }

  if (events.length === 0) return null;
  return (
    <SectionCard title="Eventy" icon={Calendar}>
      <div className="space-y-2">
        {events.map((e) => {
          const drawable = canDraw && e.active && !e.drawnAt && e.type !== "happy_hour";
          const hasParticipants = e.entriesCount > 0 || e.ticketsCount > 0;
          const meta: string[] = [];
          if (e.drawnAt) meta.push("wylosowany");
          if (!e.active) meta.push("nieaktywny");
          if (e.entriesCount > 0) meta.push(`${e.entriesCount} uczestników`);
          if (e.ticketsCount > 0) meta.push(`${e.ticketsCount} biletów`);
          if (e.endsAt) meta.push(`kończy ${formatDate(e.endsAt)}`);
          return (
            <div
              key={e.id}
              className={cn(
                "flex items-center gap-3 border p-3",
                e.active ? "border-zinc-800 bg-black/30" : "border-zinc-900 bg-zinc-950/60 opacity-60",
              )}
            >
              <span className="text-[10px] font-mono uppercase tracking-widest px-2 py-1 border border-zinc-700 text-zinc-300 shrink-0">
                {e.type}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-sm text-white font-medium truncate">{e.name}</div>
                {meta.length > 0 && (
                  <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest truncate">
                    {meta.join(" · ")}
                  </div>
                )}
              </div>
              {drawable && (
                <button
                  onClick={() => draw(e.id, e.name)}
                  disabled={pending || drawingId === e.id || !hasParticipants}
                  className="px-2.5 py-1.5 bg-purple-700 hover:bg-purple-600 text-white text-[10px] font-bold tracking-widest uppercase disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1.5 shrink-0"
                  title={hasParticipants ? "Wylosuj zwycięzców" : "Brak uczestników"}
                >
                  {drawingId === e.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Dice5 className="w-3 h-3" />}
                  Wylosuj
                </button>
              )}
              {canEdit && (
                <>
                  <button
                    onClick={() => toggleActive(e)}
                    disabled={busyId === e.id || pending || !!e.drawnAt}
                    className={cn(
                      "px-2 py-1.5 border text-[10px] font-bold tracking-widest uppercase flex items-center gap-1 shrink-0",
                      e.active ? "border-green-700 text-green-300 bg-green-950/30" : "border-zinc-700 text-zinc-500",
                      e.drawnAt && "opacity-30 cursor-not-allowed",
                    )}
                    title={e.drawnAt ? "Wylosowany — nie da się zmienić" : (e.active ? "Dezaktywuj" : "Aktywuj")}
                  >
                    {busyId === e.id ? <Loader2 className="w-3 h-3 animate-spin" /> : (e.active ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />)}
                    {e.active ? "ON" : "OFF"}
                  </button>
                  <button
                    onClick={() => setEditing(e)}
                    disabled={pending || !!e.drawnAt}
                    className="px-2 py-1.5 border border-zinc-700 hover:border-red-500 text-zinc-400 hover:text-red-400 text-[10px] font-bold tracking-widest uppercase disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1 shrink-0"
                    title={e.drawnAt ? "Wylosowany — nie da się edytować" : "Edytuj"}
                  >
                    <Pencil className="w-3 h-3" /> Edit
                  </button>
                </>
              )}
            </div>
          );
        })}
      </div>

      {editing && (
        <EventEditor
          event={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); onSuccess(); }}
          onToast={onToast}
        />
      )}
    </SectionCard>
  );
}

function EventEditor({
  event, onClose, onSaved, onToast,
}: {
  event: EventRow;
  onClose: () => void;
  onSaved: () => void;
  onToast: (k: "ok" | "err", m: string) => void;
}) {
  const [name, setName] = useState(event.name);
  const [description, setDescription] = useState(event.description ?? "");
  const [prize, setPrize] = useState(event.prize ?? "");
  const [winnersCount, setWinnersCount] = useState(event.winnersCount?.toString() ?? "1");
  const [requirement, setRequirement] = useState(event.requirement ?? "");
  const [multiplier, setMultiplier] = useState(event.multiplier?.toString() ?? "2");
  const [ticketPrice, setTicketPrice] = useState(event.ticketPrice?.toString() ?? "500");
  const [maxTicketsPerUser, setMaxTicketsPerUser] = useState(event.maxTicketsPerUser?.toString() ?? "20");
  const [extendByMinutes, setExtendByMinutes] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      const payload: Record<string, unknown> = { id: event.id, name };
      if (description !== event.description) payload.description = description || null;
      if (prize !== event.prize) payload.prize = prize || null;
      if (winnersCount !== event.winnersCount?.toString()) payload.winnersCount = parseInt(winnersCount);
      if (event.type === "giveaway" && requirement !== event.requirement) payload.requirement = requirement || null;
      if (event.type === "happy_hour" && multiplier !== event.multiplier?.toString()) payload.multiplier = parseFloat(multiplier);
      if (event.type === "raffle") {
        if (ticketPrice !== event.ticketPrice?.toString()) payload.ticketPrice = parseInt(ticketPrice);
        if (maxTicketsPerUser !== event.maxTicketsPerUser?.toString()) payload.maxTicketsPerUser = parseInt(maxTicketsPerUser);
      }
      if (extendByMinutes) payload.extendByMinutes = parseInt(extendByMinutes);

      const res = await fetch("/api/admin/events", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        onToast("err", data.error ?? "Błąd");
      } else {
        onToast("ok", "Event zaktualizowany");
        onSaved();
      }
    } finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4" onClick={() => !busy && onClose()}>
      <div role="dialog" aria-modal="true" aria-label="Edytor eventu" className="bg-zinc-950 border-2 border-zinc-800 max-w-xl w-full p-5 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-display text-xl text-white tracking-wider">EDYCJA EVENTU</h3>
            <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">{event.type}</span>
          </div>
          <button onClick={onClose} disabled={busy} className="text-zinc-500 hover:text-red-400">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-3">
          <FieldInput label="Nazwa" value={name} onChange={setName} />
          <FieldTextarea label="Opis" value={description} onChange={setDescription} />
          {event.type !== "happy_hour" && (
            <FieldInput label="Nagroda" value={prize} onChange={setPrize} />
          )}
          {event.type !== "happy_hour" && (
            <FieldInput label="Liczba zwycięzców" value={winnersCount} onChange={setWinnersCount} type="number" />
          )}
          {event.type === "giveaway" && (
            <FieldInput label="Wymóg (np. sub Twitch)" value={requirement} onChange={setRequirement} />
          )}
          {event.type === "happy_hour" && (
            <FieldInput label="Multiplier (1.1-10)" value={multiplier} onChange={setMultiplier} type="number" />
          )}
          {event.type === "raffle" && (
            <div className="grid grid-cols-2 gap-2">
              <FieldInput label="Cena biletu (GT)" value={ticketPrice} onChange={setTicketPrice} type="number" />
              <FieldInput label="Max biletów/user" value={maxTicketsPerUser} onChange={setMaxTicketsPerUser} type="number" />
            </div>
          )}
          <FieldInput label="Przedłuż o ile minut? (opcjonalne)" value={extendByMinutes} onChange={setExtendByMinutes} type="number" placeholder="np. 60" />

          <div className="flex gap-2 pt-3 border-t border-zinc-800">
            <button onClick={onClose} disabled={busy} className="flex-1 px-4 py-2.5 border border-zinc-700 text-zinc-400 text-xs font-bold tracking-widest uppercase">
              Anuluj
            </button>
            <button onClick={save} disabled={busy || !name} className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-500 text-white text-xs font-bold tracking-widest uppercase disabled:opacity-50 flex items-center justify-center gap-2">
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              Zapisz
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
