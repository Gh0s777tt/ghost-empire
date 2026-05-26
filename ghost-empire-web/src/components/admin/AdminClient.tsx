"use client";
// src/components/admin/AdminClient.tsx
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ShieldCheck, Coins, Gift, Calendar, Package, Plus, X, Loader2, Check,
  Users, TrendingUp, Trash2, Copy, Dice5, Crown, Heart, UserCog, History,
  ShoppingBag, Pencil, Eye, EyeOff, Ban, Bot, CalendarDays, Zap, Link as LinkIcon,
} from "lucide-react";
import { MOD_PERMISSIONS, PERMISSION_GROUPS } from "@/lib/permissions";
import { fmt, formatDate, cn } from "@/lib/utils";

type Stats = {
  totalUsers: number;
  totalTokensInCirculation: number;
  totalEverEarned: number;
  eventsActive: number;
  ordersPending: number;
};

type Drop = {
  id: string;
  code: string;
  reward: number;
  bonusReward: number;
  bonusSlots: number;
  expiresAt: string | null;
  createdAt: string;
  claimsCount: number;
};

type AdminEvent = {
  id: string;
  type: string;
  name: string;
  startsAt: string | null;
  endsAt: string | null;
  entriesCount: number;
  ticketsCount: number;
};

type ShopItemRow = {
  id: string;
  name: string;
  description: string;
  category: string;
  price: number;
  imageEmoji: string | null;
  stock: number;
  totalStock: number;
  hot: boolean;
  active: boolean;
  featured: boolean;
  requiresSubTier: string | null;
  requiresMinLevel: number | null;
  requiresMinMonths: number | null;
};

type EventRow = {
  id: string;
  type: string;
  name: string;
  description: string | null;
  multiplier: number | null;
  prize: string | null;
  winnersCount: number | null;
  requirement: string | null;
  ticketPrice: number | null;
  maxTicketsPerUser: number | null;
  startsAt: string | null;
  endsAt: string | null;
  drawnAt: string | null;
  active: boolean;
};

type BotConfigData = {
  id: string;
  messageReward: number;
  messageCooldownSeconds: number;
  voiceRewardPerMinute: number;
  voiceTickSeconds: number;
  afkGivesReward: boolean;
  mutedGivesReward: boolean;
  enabled: boolean;
};

type ScheduleSlot = {
  id: string;
  dayOfWeek: number;
  startHour: number;
  startMinute: number;
  durationMinutes: number;
  title: string | null;
  platform: string | null;
  active: boolean;
};

type TwitchEventSubData = {
  streamerConnected: boolean;
  broadcasterLogin: string | null;
  broadcasterId: string | null;
  connectedAt: string | null;
  subscriptions: Array<{
    id: string;
    type: string;
    status: string;
    lastSeenAt: string | null;
    createdAt: string;
  }>;
  recentEvents: Array<{
    id: string;
    type: string;
    userId: string | null;
    tokensGranted: number | null;
    receivedAt: string;
  }>;
};

type StreamlabsConnectionData =
  | { connected: false }
  | {
      connected: true;
      streamlabsUsername: string | null;
      connectedAt: string;
      lastPolledAt: string | null;
      lastSeenDonationId: string | null;
    };

type UnmatchedDonation = {
  id: string;
  externalId: string;
  donorName: string;
  message: string | null;
  amountGrosze: number;
  currency: string;
  donatedAt: string;
};

type AuditEntry = {
  id: string;
  adminId: string;
  adminName: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  details: string | null;
  ipAddress: string | null;
  createdAt: string;
};

type PendingOrder = {
  id: string;
  amount: number;
  reason: string;
  createdAt: string;
  shopItem: { name: string; imageEmoji: string | null; category: string } | null;
  user: { username: string | null; displayName: string | null; discordId: string | null; discordUsername: string | null };
};

export function AdminClient({
  isAdmin, myPermissions,
  stats, drops, events, pendingOrders, auditLog, allShopItems, allEvents,
  botConfig, scheduleSlots, streamlabsConnection, unmatchedDonations,
  twitchEventSub,
}: {
  isAdmin: boolean;
  myPermissions: string[];
  stats: Stats;
  drops: Drop[];
  events: AdminEvent[];
  pendingOrders: PendingOrder[];
  auditLog: AuditEntry[];
  allShopItems: ShopItemRow[];
  allEvents: EventRow[];
  botConfig: BotConfigData;
  scheduleSlots: ScheduleSlot[];
  streamlabsConnection: StreamlabsConnectionData;
  unmatchedDonations: UnmatchedDonation[];
  twitchEventSub: TwitchEventSubData;
}) {
  // Permission checker — admins implicitly have all
  const can = (perm: string) => isAdmin || myPermissions.includes(perm);
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [toast, setToast] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);

  function showToast(kind: "ok" | "err", msg: string) {
    setToast({ kind, msg });
    setTimeout(() => setToast(null), 5000);
  }

  function refresh() {
    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <ShieldCheck className="w-6 h-6 text-red-500" />
        <h1
          className="font-display text-4xl text-white tracking-wider"
          style={{ textShadow: "2px 0 0 rgba(229,9,20,0.6), -2px 0 0 rgba(139,0,0,0.4)" }}
        >
          ADMIN
        </h1>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatTile label="Userów" value={fmt(stats.totalUsers)} icon={Users} />
        <StatTile label="Tokens w obiegu" value={fmt(stats.totalTokensInCirculation)} suffix="GT" icon={Coins} />
        <StatTile label="Ever earned" value={fmt(stats.totalEverEarned)} suffix="GT" icon={TrendingUp} />
        <StatTile label="Aktywne eventy" value={fmt(stats.eventsActive)} icon={Calendar} />
        <StatTile label="Pending orders" value={fmt(stats.ordersPending)} icon={Package} accent={stats.ordersPending > 0} />
      </div>

      {!isAdmin && (
        <div className="border border-blue-700 bg-blue-950/30 px-4 py-2.5 text-xs text-blue-200">
          🛡️ Widzisz panel jako <strong>moderator</strong>. Twoje uprawnienia:{" "}
          <span className="font-mono">{myPermissions.length === 0 ? "BRAK" : myPermissions.join(", ")}</span>.
          Sekcje bez odpowiedniego uprawnienia są ukryte.
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {can("grant_tokens") && <GrantTokensCard onToast={showToast} onSuccess={refresh} pending={pending} />}
        {can("create_drops") && <CreateDropCard onToast={showToast} onSuccess={refresh} pending={pending} />}
      </div>

      {/* User/connection role management — admin-only (granting admin to others is too sensitive) */}
      {isAdmin && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <UserRolesCard onToast={showToast} onSuccess={refresh} pending={pending} />
          <ConnectionRolesCard onToast={showToast} onSuccess={refresh} pending={pending} />
        </div>
      )}
      {/* Mod with mark_subs but not admin — they get connection-roles but not user-roles */}
      {!isAdmin && can("mark_subs") && (
        <ConnectionRolesCard onToast={showToast} onSuccess={refresh} pending={pending} />
      )}

      {can("create_events") && <CreateEventCard onToast={showToast} onSuccess={refresh} pending={pending} />}

      {can("create_drops") && <ActiveDropsList drops={drops} onToast={showToast} onSuccess={refresh} pending={pending} />}
      {(can("edit_events") || can("draw_events")) && <ActiveEventsList events={events} onToast={showToast} onSuccess={refresh} pending={pending} />}
      {can("deliver_orders") && <PendingOrdersList orders={pendingOrders} onToast={showToast} onSuccess={refresh} pending={pending} />}
      {can("manage_shop") && <ShopManager items={allShopItems} onToast={showToast} onSuccess={refresh} pending={pending} />}
      {can("edit_events") && <EventManager events={allEvents} onToast={showToast} onSuccess={refresh} pending={pending} />}
      {can("manage_shop") && <BotConfigCard config={botConfig} onToast={showToast} onSuccess={refresh} pending={pending} />}
      {can("manage_shop") && <ScheduleManager slots={scheduleSlots} onToast={showToast} onSuccess={refresh} pending={pending} />}
      {isAdmin && (
        <StreamlabsManager
          connection={streamlabsConnection}
          unmatchedDonations={unmatchedDonations}
          onToast={showToast}
          onSuccess={refresh}
          pending={pending}
        />
      )}
      {isAdmin && (
        <TwitchEventSubManager
          data={twitchEventSub}
          onToast={showToast}
          onSuccess={refresh}
          pending={pending}
        />
      )}

      {can("view_audit") && <AuditLogSection auditLog={auditLog} />}

      {toast && (
        <div
          className={cn(
            "fixed bottom-6 right-6 z-50 max-w-md border px-4 py-3 flex items-center gap-3 shadow-2xl",
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

function StatTile({
  label, value, suffix, icon: Icon, accent,
}: {
  label: string; value: string; suffix?: string; icon: typeof Users; accent?: boolean;
}) {
  return (
    <div
      className={cn(
        "border bg-zinc-950/70 backdrop-blur-sm p-3",
        accent ? "border-orange-700 bg-orange-950/20" : "border-zinc-800",
      )}
    >
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className={cn("w-3.5 h-3.5", accent ? "text-orange-400" : "text-zinc-500")} />
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
  title, icon: Icon, children,
}: { title: string; icon: typeof Users; children: React.ReactNode }) {
  return (
    <div
      className="border border-zinc-800 bg-zinc-950/80 backdrop-blur-sm p-5"
      style={{
        clipPath:
          "polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 12px 100%, 0 calc(100% - 12px))",
      }}
    >
      <div className="flex items-center gap-2 mb-4">
        <Icon className="w-4 h-4 text-red-500" />
        <h2 className="font-display text-lg text-white tracking-wider">{title.toUpperCase()}</h2>
      </div>
      {children}
    </div>
  );
}

// ============== GRANT TOKENS ==============

function GrantTokensCard({
  onToast, onSuccess, pending,
}: {
  onToast: (k: "ok" | "err", m: string) => void;
  onSuccess: () => void;
  pending: boolean;
}) {
  const [target, setTarget] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/grant-tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target, amount: parseInt(amount), reason }),
      });
      const data = await res.json();
      if (!res.ok) {
        onToast("err", data.error ?? "Błąd");
      } else {
        onToast("ok", `${data.amount > 0 ? "+" : ""}${data.amount} GT dla ${data.user.username ?? data.user.id}. Balans: ${data.newBalance}`);
        setAmount(""); setReason("");
        onSuccess();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <SectionCard title="Grant tokenów" icon={Coins}>
      <div className="space-y-3">
        <FieldInput
          label="User (username lub Discord ID)"
          value={target}
          onChange={setTarget}
          placeholder="np. gh0s77tt lub 1500923809522258000"
        />
        <FieldInput
          label="Amount (ujemny = odjąć)"
          value={amount}
          onChange={setAmount}
          placeholder="np. 1000 lub -500"
          type="number"
        />
        <FieldInput
          label="Powód (opcjonalnie)"
          value={reason}
          onChange={setReason}
          placeholder="np. konkurs klipów"
        />
        <button
          onClick={submit}
          disabled={busy || pending || !target || !amount}
          className="w-full px-4 py-2.5 bg-red-600 hover:bg-red-500 text-white text-xs font-bold tracking-widest uppercase transition-all disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Coins className="w-3.5 h-3.5" />}
          Przyznaj
        </button>
      </div>
    </SectionCard>
  );
}

// ============== CREATE DROP ==============

function CreateDropCard({
  onToast, onSuccess, pending,
}: {
  onToast: (k: "ok" | "err", m: string) => void;
  onSuccess: () => void;
  pending: boolean;
}) {
  const [code, setCode] = useState("");
  const [reward, setReward] = useState("500");
  const [bonusReward, setBonusReward] = useState("1000");
  const [bonusSlots, setBonusSlots] = useState("10");
  const [expiresInMinutes, setExpiresInMinutes] = useState("60");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/drops", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: code || undefined,
          reward: parseInt(reward),
          bonusReward: parseInt(bonusReward),
          bonusSlots: parseInt(bonusSlots),
          expiresInMinutes: parseInt(expiresInMinutes),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        onToast("err", data.error ?? "Błąd");
      } else {
        onToast("ok", `Drop utworzony: ${data.drop.code}`);
        setCode("");
        onSuccess();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <SectionCard title="Nowy drop" icon={Gift}>
      <div className="space-y-3">
        <FieldInput
          label="Kod (puste = autogenerated)"
          value={code}
          onChange={(v) => setCode(v.toUpperCase())}
          placeholder="np. STREAM01"
        />
        <div className="grid grid-cols-2 gap-2">
          <FieldInput label="Reward GT" value={reward} onChange={setReward} type="number" />
          <FieldInput label="Bonus GT" value={bonusReward} onChange={setBonusReward} type="number" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <FieldInput label="Bonus slots" value={bonusSlots} onChange={setBonusSlots} type="number" />
          <FieldInput label="Wygasa za (min)" value={expiresInMinutes} onChange={setExpiresInMinutes} type="number" />
        </div>
        <button
          onClick={submit}
          disabled={busy || pending || !reward}
          className="w-full px-4 py-2.5 bg-red-600 hover:bg-red-500 text-white text-xs font-bold tracking-widest uppercase transition-all disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Gift className="w-3.5 h-3.5" />}
          Stwórz drop
        </button>
      </div>
    </SectionCard>
  );
}

// ============== CREATE EVENT ==============

function CreateEventCard({
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

// ============== ACTIVE LISTS ==============

function ActiveDropsList({
  drops, onToast, onSuccess, pending,
}: {
  drops: Drop[];
  onToast: (k: "ok" | "err", m: string) => void;
  onSuccess: () => void;
  pending: boolean;
}) {
  async function deactivate(id: string) {
    if (!confirm("Dezaktywować drop?")) return;
    const res = await fetch(`/api/admin/drops?id=${id}`, { method: "DELETE" });
    if (res.ok) { onToast("ok", "Drop dezaktywowany"); onSuccess(); }
    else onToast("err", "Błąd");
  }

  if (drops.length === 0) return null;
  return (
    <SectionCard title="Aktywne dropy" icon={Gift}>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
        {drops.map((d) => (
          <div key={d.id} className="border border-zinc-800 bg-black/30 p-3">
            <div className="flex items-center justify-between gap-2 mb-2">
              <button
                onClick={() => { navigator.clipboard.writeText(d.code); onToast("ok", `Skopiowane: ${d.code}`); }}
                className="font-mono text-base text-white tracking-wider hover:text-red-400 flex items-center gap-1"
                title="Kopiuj kod"
              >
                {d.code}
                <Copy className="w-3 h-3 opacity-50" />
              </button>
              <button
                onClick={() => deactivate(d.id)}
                disabled={pending}
                className="text-zinc-500 hover:text-red-400"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 space-y-0.5">
              <div>Reward: <span className="text-white">{fmt(d.reward)} GT</span></div>
              {d.bonusReward > 0 && (
                <div>Bonus: <span className="text-orange-400">+{fmt(d.bonusReward)} GT × {d.bonusSlots}</span></div>
              )}
              <div>Claims: <span className="text-white">{d.claimsCount}</span></div>
              {d.expiresAt && (
                <div>Wygasa: <span className="text-white">{formatDate(d.expiresAt)}</span></div>
              )}
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

function ActiveEventsList({
  events, onToast, onSuccess, pending,
}: {
  events: AdminEvent[];
  onToast: (k: "ok" | "err", m: string) => void;
  onSuccess: () => void;
  pending: boolean;
}) {
  const [drawingId, setDrawingId] = useState<string | null>(null);

  async function deactivate(id: string) {
    if (!confirm("Dezaktywować event?")) return;
    const res = await fetch(`/api/admin/events?id=${id}`, { method: "DELETE" });
    if (res.ok) { onToast("ok", "Event dezaktywowany"); onSuccess(); }
    else onToast("err", "Błąd");
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
    <SectionCard title="Aktywne eventy" icon={Calendar}>
      <div className="space-y-2">
        {events.map((e) => {
          const canDraw = e.type !== "happy_hour";
          const hasParticipants = e.entriesCount > 0 || e.ticketsCount > 0;
          return (
            <div key={e.id} className="flex items-center gap-3 border border-zinc-800 bg-black/30 p-3">
              <span className="text-[10px] font-mono uppercase tracking-widest px-2 py-1 border border-zinc-700 text-zinc-300">
                {e.type}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-sm text-white font-medium truncate">{e.name}</div>
                <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">
                  {e.entriesCount > 0 && `${e.entriesCount} uczestników`}
                  {e.ticketsCount > 0 && ` · ${e.ticketsCount} biletów`}
                  {e.endsAt && ` · kończy ${formatDate(e.endsAt)}`}
                </div>
              </div>
              {canDraw && (
                <button
                  onClick={() => draw(e.id, e.name)}
                  disabled={pending || drawingId === e.id || !hasParticipants}
                  className="px-2.5 py-1.5 bg-purple-700 hover:bg-purple-600 text-white text-[10px] font-bold tracking-widest uppercase disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1.5"
                  title={hasParticipants ? "Wylosuj zwycięzców" : "Brak uczestników"}
                >
                  {drawingId === e.id ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Dice5 className="w-3 h-3" />
                  )}
                  Wylosuj
                </button>
              )}
              <button
                onClick={() => deactivate(e.id)}
                disabled={pending}
                className="text-zinc-500 hover:text-red-400"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
}

function PendingOrdersList({
  orders, onToast, onSuccess, pending,
}: {
  orders: PendingOrder[];
  onToast: (k: "ok" | "err", m: string) => void;
  onSuccess: () => void;
  pending: boolean;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);

  async function act(id: string, action: "deliver" | "refund") {
    if (action === "refund" && !confirm("Zwrócić środki userowi?")) return;
    setBusyId(id);
    try {
      const note = action === "refund" ? prompt("Notatka (opcjonalnie):") ?? undefined : undefined;
      const res = await fetch("/api/admin/deliver-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactionId: id, action, note }),
      });
      const data = await res.json();
      if (!res.ok) onToast("err", data.error ?? "Błąd");
      else {
        onToast("ok", action === "deliver" ? "Oznaczone jako dostarczone" : `Zwrócono ${data.refunded} GT`);
        onSuccess();
      }
    } finally { setBusyId(null); }
  }

  if (orders.length === 0) {
    return (
      <SectionCard title="Pending orders" icon={Package}>
        <p className="text-zinc-500 text-sm">Brak zamówień do realizacji 🎉</p>
      </SectionCard>
    );
  }

  return (
    <SectionCard title="Pending orders" icon={Package}>
      <div className="space-y-2">
        {orders.map((t) => (
          <div key={t.id} className="border border-orange-900/50 bg-orange-950/10 p-3">
            <div className="flex items-start gap-3">
              <span className="text-2xl flex-shrink-0">{t.shopItem?.imageEmoji ?? "🎁"}</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm text-white font-medium truncate">
                  {t.shopItem?.name ?? t.reason}
                </div>
                <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">
                  @{t.user.username ?? "?"} · {Math.abs(t.amount)} GT · {formatDate(t.createdAt)}
                  {t.user.discordUsername && ` · 💬 ${t.user.discordUsername}`}
                </div>
                {t.user.discordId && (
                  <div className="text-[10px] font-mono text-zinc-600 mt-0.5">
                    Discord ID: {t.user.discordId}
                  </div>
                )}
              </div>
              <div className="flex gap-1 flex-shrink-0">
                <button
                  onClick={() => act(t.id, "deliver")}
                  disabled={busyId === t.id || pending}
                  className="px-2.5 py-1.5 bg-green-700 hover:bg-green-600 text-white text-[10px] font-bold tracking-widest uppercase disabled:opacity-50 flex items-center gap-1"
                >
                  {busyId === t.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                  Done
                </button>
                <button
                  onClick={() => act(t.id, "refund")}
                  disabled={busyId === t.id || pending}
                  className="px-2.5 py-1.5 border border-zinc-700 hover:border-red-500 text-zinc-400 hover:text-red-400 text-[10px] font-bold tracking-widest uppercase disabled:opacity-50"
                >
                  Refund
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

// ============== FIELDS ==============

// ============== SHOP MANAGER (list + inline edit + activate/deactivate) ==============

const CATEGORIES_SHOP = ["games", "skins", "subs", "cosmetic", "experience"] as const;
const TIERS = ["", "T1", "T2", "T3", "Prime", "OG", "DUAL"] as const;

function ShopManager({
  items, onToast, onSuccess, pending,
}: {
  items: ShopItemRow[];
  onToast: (k: "ok" | "err", m: string) => void;
  onSuccess: () => void;
  pending: boolean;
}) {
  const [editing, setEditing] = useState<ShopItemRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function toggleActive(item: ShopItemRow) {
    setBusyId(item.id);
    try {
      const res = await fetch("/api/admin/shop", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, active: !item.active }),
      });
      if (res.ok) {
        onToast("ok", item.active ? `"${item.name}" dezaktywowane` : `"${item.name}" aktywowane`);
        onSuccess();
      } else {
        const data = await res.json();
        onToast("err", data.error ?? "Błąd");
      }
    } finally { setBusyId(null); }
  }

  return (
    <SectionCard title={`Sklep (${items.length} item${items.length === 1 ? "" : "ów"})`} icon={ShoppingBag}>
      <div className="space-y-1.5">
        <button
          onClick={() => setCreating(true)}
          disabled={pending}
          className="w-full px-3 py-2 border-2 border-dashed border-zinc-700 hover:border-red-500 text-zinc-400 hover:text-red-400 text-[10px] font-bold tracking-widest uppercase transition-all flex items-center justify-center gap-1.5"
        >
          <Plus className="w-3 h-3" /> Dodaj nowy item
        </button>
        {items.map((item) => (
          <div
            key={item.id}
            className={cn(
              "flex items-center gap-3 border px-3 py-2",
              item.active ? "border-zinc-800 bg-black/30" : "border-zinc-900 bg-zinc-950/60 opacity-50",
            )}
          >
            <span className="text-xl flex-shrink-0">{item.imageEmoji ?? "🎁"}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium text-white truncate">{item.name}</span>
                <span className="text-[9px] font-mono uppercase tracking-widest px-1.5 py-0.5 border border-zinc-700 text-zinc-400">
                  {item.category}
                </span>
                {item.hot && (
                  <span className="text-[9px] font-mono uppercase tracking-widest px-1.5 py-0.5 bg-red-600 text-white">HOT</span>
                )}
                {item.requiresSubTier && (
                  <span className="text-[9px] font-mono uppercase tracking-widest px-1.5 py-0.5 border border-purple-700 text-purple-300">
                    {item.requiresSubTier}
                  </span>
                )}
              </div>
              <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">
                {fmt(item.price)} GT
                {item.stock !== -1 && ` · stock ${item.stock}/${item.totalStock}`}
                {item.stock === -1 && " · unlimited"}
              </div>
            </div>
            <button
              onClick={() => toggleActive(item)}
              disabled={busyId === item.id || pending}
              className={cn(
                "px-2 py-1.5 border text-[10px] font-bold tracking-widest uppercase flex items-center gap-1",
                item.active ? "border-green-700 text-green-300 bg-green-950/30 hover:bg-green-950/50" : "border-zinc-700 text-zinc-500 hover:text-zinc-300",
              )}
              title={item.active ? "Dezaktywuj" : "Aktywuj"}
            >
              {busyId === item.id ? <Loader2 className="w-3 h-3 animate-spin" /> : (item.active ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />)}
              {item.active ? "ON" : "OFF"}
            </button>
            <button
              onClick={() => setEditing(item)}
              disabled={pending}
              className="px-2 py-1.5 border border-zinc-700 hover:border-red-500 text-zinc-400 hover:text-red-400 text-[10px] font-bold tracking-widest uppercase flex items-center gap-1"
            >
              <Pencil className="w-3 h-3" /> Edit
            </button>
          </div>
        ))}
      </div>

      {(editing || creating) && (
        <ShopItemEditor
          item={editing}
          isNew={creating}
          onClose={() => { setEditing(null); setCreating(false); }}
          onSaved={() => { setEditing(null); setCreating(false); onSuccess(); }}
          onToast={onToast}
        />
      )}
    </SectionCard>
  );
}

function ShopItemEditor({
  item, isNew, onClose, onSaved, onToast,
}: {
  item: ShopItemRow | null;
  isNew: boolean;
  onClose: () => void;
  onSaved: () => void;
  onToast: (k: "ok" | "err", m: string) => void;
}) {
  const [name, setName] = useState(item?.name ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [category, setCategory] = useState(item?.category ?? "cosmetic");
  const [price, setPrice] = useState(item?.price.toString() ?? "1000");
  const [imageEmoji, setImageEmoji] = useState(item?.imageEmoji ?? "🎁");
  const [stock, setStock] = useState(item?.stock.toString() ?? "-1");
  const [totalStock, setTotalStock] = useState(item?.totalStock.toString() ?? "-1");
  const [hot, setHot] = useState(item?.hot ?? false);
  const [featured, setFeatured] = useState(item?.featured ?? false);
  const [requiresSubTier, setRequiresSubTier] = useState(item?.requiresSubTier ?? "");
  const [requiresMinLevel, setRequiresMinLevel] = useState(item?.requiresMinLevel?.toString() ?? "");
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      const payload: Record<string, unknown> = {
        name, description, category, price: parseInt(price),
        imageEmoji: imageEmoji || "🎁",
        stock: parseInt(stock),
        totalStock: parseInt(totalStock || stock),
        hot, featured,
        requiresSubTier: requiresSubTier || null,
        requiresMinLevel: requiresMinLevel ? parseInt(requiresMinLevel) : null,
      };
      if (!isNew && item) payload.id = item.id;

      const res = await fetch("/api/admin/shop", {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        onToast("err", data.error ?? "Błąd");
      } else {
        onToast("ok", isNew ? "Item utworzony" : "Item zaktualizowany");
        onSaved();
      }
    } finally { setBusy(false); }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={() => !busy && onClose()}
    >
      <div
        className="bg-zinc-950 border-2 border-zinc-800 max-w-2xl w-full p-5 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display text-xl text-white tracking-wider">
            {isNew ? "NOWY ITEM" : "EDYCJA ITEMA"}
          </h3>
          <button onClick={onClose} disabled={busy} className="text-zinc-500 hover:text-red-400">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-3">
          <FieldInput label="Nazwa" value={name} onChange={setName} />
          <FieldTextarea label="Opis" value={description} onChange={setDescription} />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <FieldInput label="Emoji" value={imageEmoji} onChange={setImageEmoji} placeholder="🎁" />
            <FieldInput label="Cena (GT)" value={price} onChange={setPrice} type="number" />
            <FieldInput label="Stock (-1=∞)" value={stock} onChange={setStock} type="number" />
            <FieldInput label="Total stock" value={totalStock} onChange={setTotalStock} type="number" />
          </div>

          <div>
            <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-1">Kategoria</label>
            <div className="grid grid-cols-5 gap-1">
              {CATEGORIES_SHOP.map((c) => (
                <button
                  key={c}
                  onClick={() => setCategory(c)}
                  className={cn(
                    "px-1 py-1.5 border text-[10px] font-bold tracking-widest uppercase",
                    category === c ? "border-red-500 bg-red-600/15 text-red-300" : "border-zinc-800 bg-zinc-950 text-zinc-500",
                  )}
                >{c}</button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-1">Wymagany sub tier (opcjonalny)</label>
            <div className="grid grid-cols-7 gap-1">
              {TIERS.map((t) => (
                <button
                  key={t || "none"}
                  onClick={() => setRequiresSubTier(t)}
                  className={cn(
                    "px-1 py-1.5 border text-[10px] font-bold tracking-widest uppercase",
                    requiresSubTier === t ? "border-purple-500 bg-purple-600/15 text-purple-300" : "border-zinc-800 bg-zinc-950 text-zinc-500",
                  )}
                >{t || "—"}</button>
              ))}
            </div>
          </div>

          <FieldInput label="Wymagany min level (opcjonalny)" value={requiresMinLevel} onChange={setRequiresMinLevel} type="number" />

          <div className="flex gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={hot} onChange={(e) => setHot(e.target.checked)} className="accent-red-500" />
              <span className="text-[10px] font-bold tracking-widest uppercase text-zinc-300">HOT</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={featured} onChange={(e) => setFeatured(e.target.checked)} className="accent-yellow-500" />
              <span className="text-[10px] font-bold tracking-widest uppercase text-zinc-300">FEATURED</span>
            </label>
          </div>

          <div className="flex gap-2 pt-3 border-t border-zinc-800">
            <button onClick={onClose} disabled={busy} className="flex-1 px-4 py-2.5 border border-zinc-700 text-zinc-400 text-xs font-bold tracking-widest uppercase">
              Anuluj
            </button>
            <button onClick={save} disabled={busy || !name || !description} className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-500 text-white text-xs font-bold tracking-widest uppercase disabled:opacity-50 flex items-center justify-center gap-2">
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              {isNew ? "Utwórz" : "Zapisz"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============== EVENT MANAGER (list + edit + activate/deactivate) ==============

function EventManager({
  events, onToast, onSuccess, pending,
}: {
  events: EventRow[];
  onToast: (k: "ok" | "err", m: string) => void;
  onSuccess: () => void;
  pending: boolean;
}) {
  const [editing, setEditing] = useState<EventRow | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

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

  if (events.length === 0) return null;
  return (
    <SectionCard title="Edycja eventów" icon={Calendar}>
      <div className="space-y-1.5">
        {events.map((e) => (
          <div
            key={e.id}
            className={cn(
              "flex items-center gap-3 border px-3 py-2",
              e.active ? "border-zinc-800 bg-black/30" : "border-zinc-900 bg-zinc-950/60 opacity-50",
            )}
          >
            <span className="text-[10px] font-mono uppercase tracking-widest px-2 py-1 border border-zinc-700 text-zinc-300 flex-shrink-0">
              {e.type}
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-white truncate">{e.name}</div>
              <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">
                {e.drawnAt && "wylosowany · "}
                {e.endsAt && new Date(e.endsAt).toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "short" })}
              </div>
            </div>
            <button
              onClick={() => toggleActive(e)}
              disabled={busyId === e.id || pending || !!e.drawnAt}
              className={cn(
                "px-2 py-1.5 border text-[10px] font-bold tracking-widest uppercase flex items-center gap-1",
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
              className="px-2 py-1.5 border border-zinc-700 hover:border-red-500 text-zinc-400 hover:text-red-400 text-[10px] font-bold tracking-widest uppercase disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1"
              title={e.drawnAt ? "Wylosowany — nie da się edytować" : "Edytuj"}
            >
              <Pencil className="w-3 h-3" /> Edit
            </button>
          </div>
        ))}
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
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => !busy && onClose()}>
      <div className="bg-zinc-950 border-2 border-zinc-800 max-w-xl w-full p-5 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
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

// ============== TWITCH EVENTSUB ==============

const EVENT_TYPE_LABEL: Record<string, string> = {
  "channel.subscribe": "Subskrypcje",
  "channel.subscription.gift": "Gifted Suby",
  "channel.cheer": "Cheery (bits)",
};

function TwitchEventSubManager({
  data, onToast, onSuccess, pending,
}: {
  data: TwitchEventSubData;
  onToast: (k: "ok" | "err", m: string) => void;
  onSuccess: () => void;
  pending: boolean;
}) {
  const [busy, setBusy] = useState(false);

  async function setup() {
    if (!confirm("Utworzyć subskrypcje EventSub (subs/gifts/cheers)?")) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/twitch-eventsub", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "setup" }),
      });
      const result = await res.json();
      if (!res.ok) {
        onToast("err", result.error ?? "Błąd");
      } else {
        const ok = (result.results as Array<{ ok: boolean }>).filter((r) => r.ok).length;
        const fail = (result.results as Array<{ ok: boolean }>).filter((r) => !r.ok).length;
        onToast("ok", `Setup: ok=${ok}, fail=${fail}`);
        onSuccess();
      }
    } finally { setBusy(false); }
  }

  async function deleteSub(id: string, type: string) {
    if (!confirm(`Usunąć subskrypcję ${type}?`)) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/twitch-eventsub", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", id }),
      });
      if (res.ok) { onToast("ok", "Subskrypcja usunięta"); onSuccess(); }
      else onToast("err", "Błąd");
    } finally { setBusy(false); }
  }

  return (
    <SectionCard title="Twitch EventSub (auto subs/gifts/bits)" icon={ShieldCheck}>
      <p className="text-zinc-500 text-xs mb-3">
        Automatyczne nagrody Ghost Tokens dla widzów którzy subują, giftują suby albo cheerują bits na Twitch.
        Wymaga jednorazowej autoryzacji streamera (Gh0s77tt) ze scope&apos;ami: <code className="text-red-400">channel:read:subscriptions</code>, <code className="text-red-400">bits:read</code>.
      </p>

      {/* Streamer auth status */}
      <div className="border border-zinc-800 bg-black/30 p-3 mb-3">
        {data.streamerConnected ? (
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex-1">
              <div className="text-sm font-bold text-green-300 mb-0.5">
                ● Streamer autoryzowany: @{data.broadcasterLogin}
              </div>
              <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">
                Broadcaster ID: {data.broadcasterId} · od {data.connectedAt && new Date(data.connectedAt).toLocaleString("pl-PL", { dateStyle: "short" })}
              </div>
            </div>
            <button
              onClick={setup}
              disabled={busy || pending}
              className="px-3 py-1.5 bg-purple-700 hover:bg-purple-600 text-white text-[10px] font-bold tracking-widest uppercase disabled:opacity-50 flex items-center gap-1.5"
            >
              {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
              {data.subscriptions.length === 0 ? "Utwórz subskrypcje" : "Reset + utwórz"}
            </button>
            <a
              href="/api/admin/twitch-streamer-auth"
              className="px-3 py-1.5 border border-zinc-700 hover:border-zinc-500 text-zinc-300 text-[10px] font-bold tracking-widest uppercase"
            >
              Re-autoryzuj
            </a>
          </div>
        ) : (
          <div className="text-center py-2">
            <p className="text-zinc-400 text-sm mb-3">
              Streamer Twitch jeszcze nie autoryzował. Kliknij i zaloguj jako <strong>Gh0s77tt</strong> żeby nadać Ghost Empire prawo czytania subów i bits.
            </p>
            <a
              href="/api/admin/twitch-streamer-auth"
              className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold tracking-widest uppercase"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              Autoryzuj jako streamer
            </a>
          </div>
        )}
      </div>

      {/* Subscriptions list */}
      {data.streamerConnected && (
        <>
          <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-2">
            Subskrypcje EventSub ({data.subscriptions.length})
          </div>
          {data.subscriptions.length === 0 ? (
            <p className="text-zinc-500 text-sm py-2 text-center">
              Brak subskrypcji. Kliknij &quot;Utwórz subskrypcje&quot; powyżej.
            </p>
          ) : (
            <div className="space-y-1.5 mb-4">
              {data.subscriptions.map((s) => (
                <div key={s.id} className="flex items-center gap-3 border border-zinc-800 bg-black/30 p-2">
                  <span className="text-[10px] font-mono uppercase tracking-widest px-2 py-0.5 border border-zinc-700 text-zinc-300">
                    {EVENT_TYPE_LABEL[s.type] ?? s.type}
                  </span>
                  <span className={cn(
                    "text-[10px] font-mono uppercase tracking-widest px-2 py-0.5",
                    s.status === "enabled" ? "border border-green-700 bg-green-950/30 text-green-300" : "border border-orange-700 bg-orange-950/30 text-orange-300",
                  )}>
                    {s.status}
                  </span>
                  <div className="flex-1 min-w-0 text-[10px] font-mono text-zinc-500">
                    {s.lastSeenAt ? `Last: ${new Date(s.lastSeenAt).toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "short" })}` : "Jeszcze brak eventów"}
                  </div>
                  <button
                    onClick={() => deleteSub(s.id, s.type)}
                    disabled={busy || pending}
                    className="text-zinc-500 hover:text-red-400"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Recent events log */}
          {data.recentEvents.length > 0 && (
            <>
              <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-2">
                Ostatnie eventy ({data.recentEvents.length})
              </div>
              <div className="space-y-1 text-[10px] font-mono">
                {data.recentEvents.map((e) => (
                  <div key={e.id} className="flex items-center gap-2 border-l-2 border-zinc-800 pl-2 py-1">
                    <span className="text-zinc-500 uppercase tracking-widest w-24 truncate">
                      {EVENT_TYPE_LABEL[e.type] ?? e.type}
                    </span>
                    {e.tokensGranted ? (
                      <span className="text-green-400">+{e.tokensGranted.toLocaleString("pl-PL")} GT</span>
                    ) : (
                      <span className="text-zinc-600">(unmatched)</span>
                    )}
                    <span className="text-zinc-700 ml-auto">
                      {new Date(e.receivedAt).toLocaleTimeString("pl-PL")}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </SectionCard>
  );
}

// ============== STREAMLABS DONATIONS ==============

function StreamlabsManager({
  connection, unmatchedDonations, onToast, onSuccess, pending,
}: {
  connection: StreamlabsConnectionData;
  unmatchedDonations: UnmatchedDonation[];
  onToast: (k: "ok" | "err", m: string) => void;
  onSuccess: () => void;
  pending: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [assignTarget, setAssignTarget] = useState<Record<string, string>>({});

  async function action(act: "sync" | "disconnect") {
    if (act === "disconnect" && !confirm("Rozłączyć Streamlabs?")) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/streamlabs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: act }),
      });
      const data = await res.json();
      if (!res.ok) onToast("err", data.error ?? "Błąd");
      else {
        if (act === "sync") {
          onToast(
            "ok",
            `Sync: fetched ${data.fetched ?? 0}, matched ${data.matched ?? 0}, unmatched ${data.unmatched ?? 0}`,
          );
        } else onToast("ok", "Rozłączono Streamlabs");
        onSuccess();
      }
    } finally { setBusy(false); }
  }

  async function matchDonation(donationId: string, action: "assign" | "skip") {
    const target = assignTarget[donationId];
    if (action === "assign" && !target) {
      onToast("err", "Wpisz username lub Discord ID");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/admin/donations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ donationId, action, userTarget: target }),
      });
      const data = await res.json();
      if (!res.ok) onToast("err", data.error ?? "Błąd");
      else {
        if (action === "assign") onToast("ok", `Dopasowano: ${data.tokensGranted} GT dla ${data.user}`);
        else onToast("ok", "Pominięto");
        setAssignTarget((s) => { const copy = { ...s }; delete copy[donationId]; return copy; });
        onSuccess();
      }
    } finally { setBusy(false); }
  }

  return (
    <SectionCard title="Streamlabs — donejty" icon={LinkIcon}>
      {/* Connection status */}
      <div className="border border-zinc-800 bg-black/30 p-3 mb-3">
        {connection.connected ? (
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold text-green-300 mb-0.5">
                ● Połączono {connection.streamlabsUsername && `(${connection.streamlabsUsername})`}
              </div>
              <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">
                {connection.lastPolledAt
                  ? `Ostatni sync: ${new Date(connection.lastPolledAt).toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "short" })}`
                  : "Jeszcze nie syncował się"}
              </div>
            </div>
            <button
              onClick={() => action("sync")}
              disabled={busy || pending}
              className="px-3 py-1.5 bg-blue-700 hover:bg-blue-600 text-white text-[10px] font-bold tracking-widest uppercase disabled:opacity-50 flex items-center gap-1.5"
            >
              {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
              Sync now
            </button>
            <button
              onClick={() => action("disconnect")}
              disabled={busy || pending}
              className="px-3 py-1.5 border border-red-700 hover:border-red-500 text-red-400 text-[10px] font-bold tracking-widest uppercase disabled:opacity-50"
            >
              Rozłącz
            </button>
          </div>
        ) : (
          <div className="text-center py-2">
            <p className="text-zinc-400 text-sm mb-3">
              Streamlabs jeszcze nie połączony. Po autoryzacji donejty będą automatycznie dopasowywane do userów.
            </p>
            <a
              href="/api/auth/streamlabs"
              className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-xs font-bold tracking-widest uppercase"
            >
              <LinkIcon className="w-3.5 h-3.5" />
              Połącz Streamlabs
            </a>
            <p className="text-[10px] font-mono text-zinc-600 uppercase tracking-widest mt-2">
              Otworzy stronę Streamlabs do autoryzacji
            </p>
          </div>
        )}
      </div>

      {/* Unmatched donations */}
      {connection.connected && (
        <>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">
              Nieprzypisane donejty ({unmatchedDonations.length})
            </span>
            {unmatchedDonations.length > 0 && (
              <span className="text-[9px] text-zinc-600 font-mono">
                Wpisz username lub Discord ID i kliknij Przypisz
              </span>
            )}
          </div>

          {unmatchedDonations.length === 0 ? (
            <p className="text-zinc-500 text-sm py-2 text-center">
              Brak nieprzypisanych donejtów 🎉 (auto-match działa albo nie ma jeszcze donejtów)
            </p>
          ) : (
            <div className="space-y-1.5">
              {unmatchedDonations.map((d) => (
                <div key={d.id} className="border border-orange-900/50 bg-orange-950/10 p-2.5">
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <span className="text-[10px] font-mono uppercase tracking-widest text-orange-300">
                      {(d.amountGrosze / 100).toFixed(2)} {d.currency}
                    </span>
                    <span className="text-sm text-white font-medium">{d.donorName}</span>
                    <span className="text-[10px] font-mono text-zinc-500 ml-auto">
                      {new Date(d.donatedAt).toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "short" })}
                    </span>
                  </div>
                  {d.message && (
                    <div className="text-xs text-zinc-400 italic mb-2">"{d.message}"</div>
                  )}
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      placeholder="username lub Discord ID"
                      value={assignTarget[d.id] ?? ""}
                      onChange={(e) => setAssignTarget((s) => ({ ...s, [d.id]: e.target.value }))}
                      className="flex-1 border border-zinc-800 bg-black/30 px-2 py-1 text-xs text-white font-mono outline-none focus:border-red-600 placeholder:text-zinc-700"
                    />
                    <button
                      onClick={() => matchDonation(d.id, "assign")}
                      disabled={busy}
                      className="px-3 py-1 bg-green-700 hover:bg-green-600 text-white text-[10px] font-bold tracking-widest uppercase disabled:opacity-50"
                    >
                      Przypisz
                    </button>
                    <button
                      onClick={() => matchDonation(d.id, "skip")}
                      disabled={busy}
                      className="px-3 py-1 border border-zinc-700 hover:border-red-500 text-zinc-400 hover:text-red-400 text-[10px] font-bold tracking-widest uppercase"
                    >
                      Pomiń
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </SectionCard>
  );
}

// ============== AUDIT LOG VIEWER ==============

const ACTION_LABEL: Record<string, { label: string; emoji: string; color: string }> = {
  grant_tokens:        { label: "Grant tokenów",   emoji: "💰", color: "#10b981" },
  create_drop:         { label: "Nowy drop",       emoji: "🎁", color: "#FF4500" },
  deactivate_drop:     { label: "Dezakt. drop",    emoji: "🗑️", color: "#71717a" },
  create_event:        { label: "Nowy event",      emoji: "📅", color: "#3b82f6" },
  deactivate_event:    { label: "Dezakt. event",   emoji: "🗑️", color: "#71717a" },
  draw_event:          { label: "Losowanie",       emoji: "🎲", color: "#a855f7" },
  deliver_order:       { label: "Dostarczone",     emoji: "📦", color: "#10b981" },
  refund_order:        { label: "Zwrot",           emoji: "↩️", color: "#fbbf24" },
  set_user_role:       { label: "Rola usera",      emoji: "👑", color: "#ef4444" },
  set_connection_role: { label: "Status platform", emoji: "🔗", color: "#a855f7" },
};

function AuditLogSection({ auditLog }: { auditLog: AuditEntry[] }) {
  if (auditLog.length === 0) {
    return (
      <SectionCard title="Audit log" icon={History}>
        <p className="text-zinc-500 text-sm">Brak akcji admin w bazie. Tu pojawi się każdy grant/draw/refund kto i kiedy.</p>
      </SectionCard>
    );
  }

  return (
    <SectionCard title={`Audit log (ostatnie ${auditLog.length})`} icon={History}>
      <div className="space-y-1 max-h-[500px] overflow-y-auto">
        {auditLog.map((entry) => {
          const meta = ACTION_LABEL[entry.action] ?? { label: entry.action, emoji: "•", color: "#71717a" };
          const date = new Date(entry.createdAt);
          let detailsText = "";
          if (entry.details) {
            try {
              const parsed = JSON.parse(entry.details);
              detailsText = Object.entries(parsed)
                .filter(([, v]) => v !== null && v !== undefined && v !== "")
                .map(([k, v]) => `${k}=${typeof v === "object" ? JSON.stringify(v) : v}`)
                .join(" · ");
            } catch {
              detailsText = entry.details;
            }
          }
          return (
            <div key={entry.id} className="flex items-start gap-3 border-l-2 border-zinc-800 pl-3 py-1.5">
              <span className="text-base flex-shrink-0">{meta.emoji}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-sm text-white" style={{ color: meta.color }}>
                    {meta.label}
                  </span>
                  <span className="text-[10px] font-mono text-zinc-600 uppercase tracking-widest">
                    by {entry.adminId.slice(-8)}
                  </span>
                  <span className="text-[10px] font-mono text-zinc-700 ml-auto">
                    {date.toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "short" })}
                  </span>
                </div>
                {detailsText && (
                  <div className="text-[11px] font-mono text-zinc-500 leading-snug mt-0.5 break-all">
                    {detailsText}
                  </div>
                )}
                {entry.ipAddress && (
                  <div className="text-[9px] font-mono text-zinc-700 mt-0.5">
                    IP: {entry.ipAddress}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
}

// ============== MOD PERMISSIONS PICKER ==============

function ModPermissionsPicker({
  selected,
  onToggle,
}: {
  selected: Set<string>;
  onToggle: (id: string) => void;
}) {
  const grouped: Record<string, typeof MOD_PERMISSIONS[number][]> = {};
  for (const p of MOD_PERMISSIONS) {
    if (!grouped[p.group]) grouped[p.group] = [];
    grouped[p.group].push(p);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 flex items-center gap-1.5">
          <ShieldCheck className="w-3 h-3" /> Uprawnienia moderatora
        </label>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => MOD_PERMISSIONS.forEach((p) => !selected.has(p.id) && onToggle(p.id))}
            className="text-[9px] font-mono uppercase tracking-widest text-zinc-500 hover:text-green-400"
          >
            Zaznacz wszystkie
          </button>
          <span className="text-[9px] text-zinc-700">·</span>
          <button
            type="button"
            onClick={() => MOD_PERMISSIONS.forEach((p) => selected.has(p.id) && onToggle(p.id))}
            className="text-[9px] font-mono uppercase tracking-widest text-zinc-500 hover:text-red-400"
          >
            Wyczyść
          </button>
        </div>
      </div>

      <div className="space-y-2">
        {Object.entries(grouped).map(([groupKey, perms]) => {
          const group = PERMISSION_GROUPS[groupKey];
          return (
            <div key={groupKey} className="border border-zinc-800 bg-black/30 p-2.5">
              <div
                className="text-[9px] font-mono uppercase tracking-widest mb-2"
                style={{ color: group.color }}
              >
                {group.label}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {perms.map((p) => {
                  const isSet = selected.has(p.id);
                  return (
                    <label
                      key={p.id}
                      className={cn(
                        "flex items-center gap-2 px-2 py-1.5 border cursor-pointer transition-all",
                        isSet
                          ? "border-blue-700 bg-blue-950/30 text-blue-200"
                          : "border-zinc-800 bg-zinc-950 text-zinc-400 hover:border-zinc-700",
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={isSet}
                        onChange={() => onToggle(p.id)}
                        className="accent-blue-500"
                      />
                      <span className="text-xs">{p.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-[9px] font-mono text-zinc-600 mt-2 leading-snug">
        Admini mają wszystkie uprawnienia automatycznie. Moderatorzy — tylko zaznaczone.
      </p>
    </div>
  );
}

// ============== USER ROLES (admin/mod/donator) ==============

function UserRolesCard({
  onToast, onSuccess, pending,
}: {
  onToast: (k: "ok" | "err", m: string) => void;
  onSuccess: () => void;
  pending: boolean;
}) {
  const [target, setTarget] = useState("");
  const [role, setRole] = useState<"admin" | "moderator" | "donator">("moderator");
  const [enable, setEnable] = useState(true);
  const [addDonation, setAddDonation] = useState("");
  const [modPermissions, setModPermissions] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  function togglePerm(id: string) {
    setModPermissions((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function submit() {
    setBusy(true);
    try {
      const body: Record<string, unknown> = { target, role, enable };
      if (role === "donator" && addDonation) {
        body.addDonation = parseInt(addDonation);
      }
      if (role === "moderator" && enable) {
        body.modPermissions = Array.from(modPermissions);
      }
      const res = await fetch("/api/admin/user-roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        onToast("err", data.error ?? "Błąd");
      } else {
        onToast(
          "ok",
          `${enable ? "Nadana" : "Odebrana"} rola ${role} dla ${data.user.username ?? data.user.id}`,
        );
        setTarget("");
        setAddDonation("");
        onSuccess();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <SectionCard title="Role usera (admin/mod/donator)" icon={UserCog}>
      <div className="space-y-3">
        <FieldInput
          label="User (username lub Discord ID)"
          value={target}
          onChange={setTarget}
          placeholder="np. gh0s77tt lub 1500923809522258000"
        />

        <div>
          <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-1">
            Rola
          </label>
          <div className="grid grid-cols-3 gap-1">
            {(["admin", "moderator", "donator"] as const).map((r) => {
              const meta = {
                admin: { label: "Admin", icon: Crown, color: "red" },
                moderator: { label: "Moderator", icon: ShieldCheck, color: "blue" },
                donator: { label: "Donator", icon: Heart, color: "yellow" },
              }[r];
              const Icon = meta.icon;
              return (
                <button
                  key={r}
                  onClick={() => setRole(r)}
                  className={cn(
                    "px-2 py-2 border text-[10px] font-bold tracking-widest uppercase flex items-center justify-center gap-1.5",
                    role === r
                      ? `border-${meta.color}-500 bg-${meta.color}-600/20 text-${meta.color}-300`
                      : "border-zinc-800 bg-zinc-950 text-zinc-500 hover:text-zinc-300",
                  )}
                  style={
                    role === r
                      ? {
                          borderColor: { red: "#ef4444", blue: "#3b82f6", yellow: "#eab308" }[meta.color],
                          background: { red: "rgba(239,68,68,0.15)", blue: "rgba(59,130,246,0.15)", yellow: "rgba(234,179,8,0.15)" }[meta.color],
                          color: { red: "#fca5a5", blue: "#93c5fd", yellow: "#fde68a" }[meta.color],
                        }
                      : undefined
                  }
                >
                  <Icon className="w-3 h-3" />
                  {meta.label}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-1">
            Akcja
          </label>
          <div className="grid grid-cols-2 gap-1">
            <button
              onClick={() => setEnable(true)}
              className={cn(
                "px-2 py-2 border text-[10px] font-bold tracking-widest uppercase",
                enable ? "border-green-500 bg-green-600/20 text-green-300" : "border-zinc-800 bg-zinc-950 text-zinc-500",
              )}
            >
              ✓ Nadaj
            </button>
            <button
              onClick={() => setEnable(false)}
              className={cn(
                "px-2 py-2 border text-[10px] font-bold tracking-widest uppercase",
                !enable ? "border-red-500 bg-red-600/20 text-red-300" : "border-zinc-800 bg-zinc-950 text-zinc-500",
              )}
            >
              ✗ Odbierz
            </button>
          </div>
        </div>

        {role === "donator" && enable && (
          <FieldInput
            label="Kwota donacji (opcjonalna, sumuje się)"
            value={addDonation}
            onChange={setAddDonation}
            placeholder="np. 50 (PLN)"
            type="number"
          />
        )}

        {role === "moderator" && enable && (
          <ModPermissionsPicker selected={modPermissions} onToggle={togglePerm} />
        )}

        <button
          onClick={submit}
          disabled={busy || pending || !target}
          className="w-full px-4 py-2.5 bg-red-600 hover:bg-red-500 text-white text-xs font-bold tracking-widest uppercase transition-all disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserCog className="w-3.5 h-3.5" />}
          Zastosuj
        </button>
      </div>
    </SectionCard>
  );
}

// ============== CONNECTION ROLES (per platform: sub/mod/VIP) ==============

function ConnectionRolesCard({
  onToast, onSuccess, pending,
}: {
  onToast: (k: "ok" | "err", m: string) => void;
  onSuccess: () => void;
  pending: boolean;
}) {
  const [target, setTarget] = useState("");
  const [platform, setPlatform] = useState<"twitch" | "kick" | "discord" | "youtube">("twitch");
  const [isSubscriber, setIsSubscriber] = useState(false);
  const [subTier, setSubTier] = useState<"T1" | "T2" | "T3" | "Prime">("T1");
  const [subMonths, setSubMonths] = useState("");
  const [isModerator, setIsModerator] = useState(false);
  const [isVip, setIsVip] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      const body: Record<string, unknown> = {
        target,
        platform,
        isSubscriber,
        isModerator,
        isVip,
      };
      if (isSubscriber) {
        body.subTier = subTier;
        if (subMonths) body.subMonths = parseInt(subMonths);
      }
      const res = await fetch("/api/admin/connection-roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        onToast("err", data.error ?? "Błąd");
      } else {
        onToast("ok", `Status ${platform} zaktualizowany dla ${target}`);
        setTarget("");
        setSubMonths("");
        onSuccess();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <SectionCard title="Status na platformie (sub/mod/VIP)" icon={ShieldCheck}>
      <div className="space-y-3">
        <FieldInput label="User" value={target} onChange={setTarget} placeholder="username / Discord ID" />

        <div>
          <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-1">
            Platforma
          </label>
          <div className="grid grid-cols-4 gap-1">
            {(["twitch", "kick", "discord", "youtube"] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPlatform(p)}
                className={cn(
                  "px-2 py-1.5 border text-[10px] font-bold tracking-widest uppercase",
                  platform === p
                    ? "border-purple-500 bg-purple-600/20 text-purple-300"
                    : "border-zinc-800 bg-zinc-950 text-zinc-500 hover:text-zinc-300",
                )}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <label className="flex items-center gap-2 border border-zinc-800 bg-black/30 p-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isSubscriber}
              onChange={(e) => setIsSubscriber(e.target.checked)}
              className="accent-purple-500"
            />
            <span className="text-[10px] font-bold tracking-widest uppercase text-zinc-300">SUB</span>
          </label>
          <label className="flex items-center gap-2 border border-zinc-800 bg-black/30 p-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isModerator}
              onChange={(e) => setIsModerator(e.target.checked)}
              className="accent-blue-500"
            />
            <span className="text-[10px] font-bold tracking-widest uppercase text-zinc-300">MOD</span>
          </label>
          <label className="flex items-center gap-2 border border-zinc-800 bg-black/30 p-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isVip}
              onChange={(e) => setIsVip(e.target.checked)}
              className="accent-pink-500"
            />
            <span className="text-[10px] font-bold tracking-widest uppercase text-zinc-300">VIP</span>
          </label>
        </div>

        {isSubscriber && (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-1">
                Tier
              </label>
              <div className="grid grid-cols-4 gap-1">
                {(["T1", "T2", "T3", "Prime"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setSubTier(t)}
                    className={cn(
                      "px-1 py-1.5 border text-[10px] font-bold tracking-widest uppercase",
                      subTier === t
                        ? "border-purple-500 bg-purple-600/20 text-purple-300"
                        : "border-zinc-800 bg-zinc-950 text-zinc-500",
                    )}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <FieldInput label="Miesięcy sub" value={subMonths} onChange={setSubMonths} type="number" placeholder="0" />
          </div>
        )}

        <button
          onClick={submit}
          disabled={busy || pending || !target}
          className="w-full px-4 py-2.5 bg-red-600 hover:bg-red-500 text-white text-xs font-bold tracking-widest uppercase transition-all disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
          Zaktualizuj
        </button>
      </div>
    </SectionCard>
  );
}

// ============== BOT CONFIG ==============

function BotConfigCard({
  config, onToast, onSuccess, pending,
}: {
  config: BotConfigData;
  onToast: (k: "ok" | "err", m: string) => void;
  onSuccess: () => void;
  pending: boolean;
}) {
  const [messageReward, setMessageReward] = useState(config.messageReward.toString());
  const [messageCooldownSeconds, setMessageCooldownSeconds] = useState(config.messageCooldownSeconds.toString());
  const [voiceRewardPerMinute, setVoiceRewardPerMinute] = useState(config.voiceRewardPerMinute.toString());
  const [voiceTickSeconds, setVoiceTickSeconds] = useState(config.voiceTickSeconds.toString());
  const [afkGivesReward, setAfkGivesReward] = useState(config.afkGivesReward);
  const [mutedGivesReward, setMutedGivesReward] = useState(config.mutedGivesReward);
  const [enabled, setEnabled] = useState(config.enabled);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/bot-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messageReward: parseInt(messageReward),
          messageCooldownSeconds: parseInt(messageCooldownSeconds),
          voiceRewardPerMinute: parseInt(voiceRewardPerMinute),
          voiceTickSeconds: parseInt(voiceTickSeconds),
          afkGivesReward,
          mutedGivesReward,
          enabled,
        }),
      });
      const data = await res.json();
      if (!res.ok) onToast("err", data.error ?? "Błąd");
      else {
        onToast("ok", "Bot config zaktualizowany. Bot zaaplikuje przy następnym fetch'u (~60s).");
        onSuccess();
      }
    } finally { setBusy(false); }
  }

  return (
    <SectionCard title="Bot Discord — konfiguracja nagród" icon={Bot}>
      <p className="text-zinc-500 text-xs mb-3">
        Bot pobiera te wartości z API co ~60s. Zmiany zaaplikują się automatycznie bez restartu bota.
      </p>

      <div className="space-y-3">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="accent-green-500"
          />
          <span className="text-xs font-bold tracking-widest uppercase text-zinc-300">
            Bot ENABLED — gdy wyłączone, bot nie nalicza tokenów
          </span>
        </label>

        <div className="grid grid-cols-2 gap-2">
          <FieldInput label="Tokenów za wiadomość" value={messageReward} onChange={setMessageReward} type="number" />
          <FieldInput label="Cooldown wiadomości (s)" value={messageCooldownSeconds} onChange={setMessageCooldownSeconds} type="number" />
          <FieldInput label="Tokeny / min voice" value={voiceRewardPerMinute} onChange={setVoiceRewardPerMinute} type="number" />
          <FieldInput label="Voice tick (s)" value={voiceTickSeconds} onChange={setVoiceTickSeconds} type="number" />
        </div>

        <div className="flex gap-4 pt-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={afkGivesReward}
              onChange={(e) => setAfkGivesReward(e.target.checked)}
              className="accent-purple-500"
            />
            <span className="text-[10px] font-bold tracking-widest uppercase text-zinc-300">
              AFK channel daje tokeny
            </span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={mutedGivesReward}
              onChange={(e) => setMutedGivesReward(e.target.checked)}
              className="accent-blue-500"
            />
            <span className="text-[10px] font-bold tracking-widest uppercase text-zinc-300">
              Muteowani dostają tokeny (słuchanie = aktywność)
            </span>
          </label>
        </div>

        <button
          onClick={save}
          disabled={busy || pending}
          className="w-full px-4 py-2.5 bg-red-600 hover:bg-red-500 text-white text-xs font-bold tracking-widest uppercase disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          Zapisz config bota
        </button>
      </div>
    </SectionCard>
  );
}

// ============== SCHEDULE MANAGER ==============

const DAYS_PL_LONG = ["Niedziela", "Poniedziałek", "Wtorek", "Środa", "Czwartek", "Piątek", "Sobota"];

function ScheduleManager({
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

function FieldInput({
  label, value, onChange, placeholder, type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div>
      <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-1">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full border border-zinc-800 bg-black/30 px-3 py-2 text-sm text-white font-mono outline-none focus:border-red-600 placeholder:text-zinc-700"
      />
    </div>
  );
}

function FieldTextarea({
  label, value, onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-1">
        {label}
      </label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={2}
        className="w-full border border-zinc-800 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-red-600 resize-y"
      />
    </div>
  );
}
