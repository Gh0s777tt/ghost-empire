"use client";
// src/components/admin/sections/Events.tsx — lazily-loaded events cluster:
// holiday templates, create-event form, and the active-events manager + editor.
import { useState } from "react";
import { Calendar, Loader2, Zap, Plus, Dice5, Eye, EyeOff, Pencil, X, Check } from "lucide-react";
import { useTranslations } from "next-intl";
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

// Structural metadata only; the player-facing text (label/name/description/prize/
// requirement) is pulled from the `admin.events.tpl.<key>` namespace per locale, so
// a PL panel creates PL events and an EN panel creates EN events.
type HolidayMeta = {
  key: string;
  emoji: string;
  type: "happy_hour" | "giveaway";
  durationMinutes: number;
  multiplier?: number;
  winnersCount?: number;
};

const HOLIDAY_META: HolidayMeta[] = [
  { key: "womens_day", emoji: "💃", type: "happy_hour", durationMinutes: 1440, multiplier: 2 },
  { key: "valentines", emoji: "❤️", type: "happy_hour", durationMinutes: 1440, multiplier: 2 },
  { key: "easter", emoji: "🐰", type: "giveaway", durationMinutes: 2880, winnersCount: 3 },
  { key: "halloween", emoji: "🎃", type: "happy_hour", durationMinutes: 1440, multiplier: 3 },
  { key: "christmas", emoji: "🎄", type: "giveaway", durationMinutes: 4320, winnersCount: 5 },
  { key: "nye", emoji: "🎆", type: "happy_hour", durationMinutes: 720, multiplier: 2.5 },
];

export function HolidayEventsCard({
  onToast, onSuccess, pending,
}: {
  onToast: (k: "ok" | "err", m: string) => void;
  onSuccess: () => void;
  pending: boolean;
}) {
  const t = useTranslations("admin.events");
  const [busy, setBusy] = useState<string | null>(null);

  const templates: HolidayTemplate[] = HOLIDAY_META.map((m) => ({
    key: m.key,
    emoji: m.emoji,
    label: t(`tpl.${m.key}.label`),
    payload: {
      type: m.type,
      name: t(`tpl.${m.key}.name`),
      description: t(`tpl.${m.key}.description`),
      durationMinutes: m.durationMinutes,
      ...(m.type === "happy_hour" ? { multiplier: m.multiplier } : {}),
      ...(m.type === "giveaway"
        ? { prize: t(`tpl.${m.key}.prize`), winnersCount: m.winnersCount, requirement: t(`tpl.${m.key}.requirement`) }
        : {}),
    },
  }));

  async function launch(tpl: HolidayTemplate) {
    setBusy(tpl.key);
    try {
      const res = await fetch("/api/admin/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...tpl.payload, startsInMinutes: 0 }),
      });
      const data = await res.json();
      if (!res.ok) onToast("err", data.error ?? t("err"));
      else { onToast("ok", t("launched", { label: tpl.label })); onSuccess(); }
    } catch {
      onToast("err", t("netErr"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <SectionCard title={t("templatesTitle")} icon={Calendar}>
      <p className="text-xs text-zinc-500 mb-3 leading-relaxed">
        {t.rich("templatesIntro", { b: (c) => <strong className="text-zinc-300">{c}</strong> })}
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {templates.map((tpl) => (
          <div key={tpl.key} className="border border-zinc-800 bg-zinc-950 p-3 flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <span className="text-2xl">{tpl.emoji}</span>
              <div className="min-w-0">
                <div className="text-sm font-bold text-white truncate">{tpl.label}</div>
                <div className="text-[10px] font-mono text-zinc-500">
                  {tpl.payload.type === "happy_hour" ? `happy hour ×${tpl.payload.multiplier}` : "giveaway"} · {Math.round(tpl.payload.durationMinutes / 60)}h
                </div>
              </div>
            </div>
            <p className="text-[11px] text-zinc-500 leading-snug flex-1">{tpl.payload.description}</p>
            <button
              onClick={() => launch(tpl)}
              disabled={busy !== null || pending}
              className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white text-[10px] font-bold tracking-widest uppercase transition-all disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              {busy === tpl.key ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
              {t("launchNow")}
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
  const t = useTranslations("admin.events");
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
        onToast("err", data.error ?? t("err"));
      } else {
        onToast("ok", t("created", { name: data.event.name }));
        setName(""); setDescription(""); setPrize(""); setRequirement("");
        onSuccess();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <SectionCard title={t("newEvent")} icon={Calendar}>
      <div className="space-y-3">
        {/* Type selector */}
        <div>
          <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-1">
            {t("typeLabel")}
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1">
            {(["giveaway", "raffle", "contest", "happy_hour"] as const).map((ty) => (
              <button
                key={ty}
                onClick={() => setType(ty)}
                className={cn(
                  "px-2 py-1.5 border text-[10px] font-bold tracking-widest uppercase",
                  type === ty
                    ? "border-red-500 bg-red-600/20 text-red-300"
                    : "border-zinc-800 bg-zinc-950 text-zinc-500 hover:text-zinc-300",
                )}
              >
                {ty.replace("_", " ")}
              </button>
            ))}
          </div>
        </div>

        <FieldInput label={t("nameLabel")} value={name} onChange={setName} placeholder={t("namePh")} />
        <FieldTextarea label={t("descOptional")} value={description} onChange={setDescription} />

        {type !== "happy_hour" && (
          <FieldInput label={t("prizeLabel")} value={prize} onChange={setPrize} placeholder={t("prizePh")} />
        )}

        {(type === "giveaway" || type === "raffle" || type === "contest") && (
          <FieldInput label={t("winnersCount")} value={winnersCount} onChange={setWinnersCount} type="number" />
        )}
        {type === "giveaway" && (
          <FieldInput
            label={t("requirement")}
            value={requirement}
            onChange={setRequirement}
            placeholder={t("requirementPh")}
          />
        )}
        {type === "happy_hour" && (
          <FieldInput label={t("multiplier")} value={multiplier} onChange={setMultiplier} type="number" placeholder={t("multiplierPh")} />
        )}
        {type === "raffle" && (
          <div className="grid grid-cols-2 gap-2">
            <FieldInput label={t("ticketPrice")} value={ticketPrice} onChange={setTicketPrice} type="number" />
            <FieldInput label={t("maxTickets")} value={maxTicketsPerUser} onChange={setMaxTicketsPerUser} type="number" />
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <FieldInput label={t("startsIn")} value={startsInMinutes} onChange={setStartsInMinutes} type="number" />
          <FieldInput label={t("duration")} value={durationMinutes} onChange={setDurationMinutes} type="number" />
        </div>

        <button
          onClick={submit}
          disabled={busy || pending || !name || (type !== "happy_hour" && !prize)}
          className="w-full px-4 py-2.5 bg-red-600 hover:bg-red-500 text-white text-xs font-bold tracking-widest uppercase transition-all disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
          {t("createEvent")}
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
  const t = useTranslations("admin.events");
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
        onToast("ok", e.active ? t("deactivated", { name: e.name }) : t("activated", { name: e.name }));
        onSuccess();
      } else {
        const data = await res.json();
        onToast("err", data.error ?? t("err"));
      }
    } finally { setBusyId(null); }
  }

  async function draw(id: string, name: string) {
    if (!confirm(t("drawConfirm", { name }))) return;
    setDrawingId(id);
    try {
      const res = await fetch("/api/admin/events/draw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId: id }),
      });
      const data = await res.json();
      if (!res.ok) {
        onToast("err", data.error ?? t("drawErr"));
      } else {
        const names = data.winners
          .map((w: { username: string | null; displayName: string | null }) =>
            w.displayName ?? w.username ?? t("anon"),
          )
          .join(", ");
        onToast("ok", t("drawn", { count: data.actualWinners, names }));
        onSuccess();
      }
    } finally {
      setDrawingId(null);
    }
  }

  if (events.length === 0) return null;
  return (
    <SectionCard title={t("title")} icon={Calendar}>
      <div className="space-y-2">
        {events.map((e) => {
          const drawable = canDraw && e.active && !e.drawnAt && e.type !== "happy_hour";
          const hasParticipants = e.entriesCount > 0 || e.ticketsCount > 0;
          const meta: string[] = [];
          if (e.drawnAt) meta.push(t("metaDrawn"));
          if (!e.active) meta.push(t("metaInactive"));
          if (e.entriesCount > 0) meta.push(t("metaParticipants", { count: e.entriesCount }));
          if (e.ticketsCount > 0) meta.push(t("metaTickets", { count: e.ticketsCount }));
          if (e.endsAt) meta.push(t("metaEnds", { date: formatDate(e.endsAt) }));
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
                  title={hasParticipants ? t("drawTitle") : t("noParticipants")}
                >
                  {drawingId === e.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Dice5 className="w-3 h-3" />}
                  {t("drawBtn")}
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
                    title={e.drawnAt ? t("drawnLockedTitle") : (e.active ? t("deactivate") : t("activate"))}
                  >
                    {busyId === e.id ? <Loader2 className="w-3 h-3 animate-spin" /> : (e.active ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />)}
                    {e.active ? "ON" : "OFF"}
                  </button>
                  <button
                    onClick={() => setEditing(e)}
                    disabled={pending || !!e.drawnAt}
                    className="px-2 py-1.5 border border-zinc-700 hover:border-red-500 text-zinc-400 hover:text-red-400 text-[10px] font-bold tracking-widest uppercase disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1 shrink-0"
                    title={e.drawnAt ? t("drawnEditTitle") : t("editTitle")}
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
  const t = useTranslations("admin.events");

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
        onToast("err", data.error ?? t("err"));
      } else {
        onToast("ok", t("updated"));
        onSaved();
      }
    } finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4" onClick={() => !busy && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={t("editorAria")} className="bg-zinc-950 border-2 border-zinc-800 max-w-xl w-full p-5 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-display text-xl text-white tracking-wider">{t("editorHeading")}</h3>
            <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">{event.type}</span>
          </div>
          <button onClick={onClose} disabled={busy} className="text-zinc-500 hover:text-red-400">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-3">
          <FieldInput label={t("nameLabel")} value={name} onChange={setName} />
          <FieldTextarea label={t("descLabel")} value={description} onChange={setDescription} />
          {event.type !== "happy_hour" && (
            <FieldInput label={t("prizeLabel")} value={prize} onChange={setPrize} />
          )}
          {event.type !== "happy_hour" && (
            <FieldInput label={t("winnersCount")} value={winnersCount} onChange={setWinnersCount} type="number" />
          )}
          {event.type === "giveaway" && (
            <FieldInput label={t("requirementShort")} value={requirement} onChange={setRequirement} />
          )}
          {event.type === "happy_hour" && (
            <FieldInput label={t("multiplierRange")} value={multiplier} onChange={setMultiplier} type="number" />
          )}
          {event.type === "raffle" && (
            <div className="grid grid-cols-2 gap-2">
              <FieldInput label={t("ticketPrice")} value={ticketPrice} onChange={setTicketPrice} type="number" />
              <FieldInput label={t("maxTicketsShort")} value={maxTicketsPerUser} onChange={setMaxTicketsPerUser} type="number" />
            </div>
          )}
          <FieldInput label={t("extendBy")} value={extendByMinutes} onChange={setExtendByMinutes} type="number" placeholder={t("extendPh")} />

          <div className="flex gap-2 pt-3 border-t border-zinc-800">
            <button onClick={onClose} disabled={busy} className="flex-1 px-4 py-2.5 border border-zinc-700 text-zinc-400 text-xs font-bold tracking-widest uppercase">
              {t("cancel")}
            </button>
            <button onClick={save} disabled={busy || !name} className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-500 text-white text-xs font-bold tracking-widest uppercase disabled:opacity-50 flex items-center justify-center gap-2">
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              {t("save")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
