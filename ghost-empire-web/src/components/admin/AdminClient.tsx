"use client";
// src/components/admin/AdminClient.tsx
import { useState, useTransition, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  ShieldCheck, Coins, Gift, Calendar, Package, Plus, X, Loader2, Check,
  Users, TrendingUp, Trash2, Copy, Dice5, Crown, Heart, UserCog, History,
  ShoppingBag, Pencil, Eye, EyeOff, Ban, Bot, CalendarDays, Zap, Link as LinkIcon,
  LayoutDashboard, Bell, Tv, Menu, GitMerge, AlertTriangle, Youtube, Radio,
  Target, RefreshCw,
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

type StreamAlertsData = {
  overlayToken: string | null;
  settings: {
    enabledTypes: string[];
    durationMs: number;
    accentColor: string;
    soundEnabled: boolean;
  };
  allTypes: string[];
  recent: Array<{
    id: string;
    type: string;
    title: string;
    message: string;
    icon: string | null;
    actorName: string | null;
    amount: number | null;
    amountLabel: string | null;
    createdAt: string;
    shownAt: string | null;
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
  twitchEventSub, streamAlerts,
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
  streamAlerts: StreamAlertsData;
}) {
  // Permission checker — admins implicitly have all
  const can = useCallback(
    (perm: string) => isAdmin || myPermissions.includes(perm),
    [isAdmin, myPermissions],
  );
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [toast, setToast] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);

  // Navigation sections — each maps to a group of cards previously rendered linearly.
  // `permission` returns true if the user can see ANY card in this section.
  type SectionId =
    | "dashboard" | "users" | "merge" | "events" | "shop" | "drops"
    | "schedule" | "bot" | "donations" | "twitch" | "youtube" | "alerts" | "goals" | "predictions" | "audit";

  const SECTIONS: Array<{
    id: SectionId;
    label: string;
    icon: typeof Users;
    permission: () => boolean;
  }> = [
    { id: "dashboard", label: "Dashboard",   icon: LayoutDashboard, permission: () => true },
    { id: "users",     label: "Użytkownicy", icon: UserCog,         permission: () => can("grant_tokens") || isAdmin || can("mark_subs") },
    { id: "merge",     label: "Merge duplikatów", icon: GitMerge,   permission: () => isAdmin },
    { id: "events",    label: "Eventy",      icon: Calendar,        permission: () => can("create_events") || can("edit_events") || can("draw_events") },
    { id: "shop",      label: "Sklep",       icon: ShoppingBag,     permission: () => can("manage_shop") || can("deliver_orders") },
    { id: "drops",     label: "Drops",       icon: Gift,            permission: () => can("create_drops") },
    { id: "schedule",  label: "Harmonogram", icon: CalendarDays,    permission: () => can("manage_shop") },
    { id: "bot",       label: "Bot Discord", icon: Bot,             permission: () => can("manage_shop") },
    { id: "donations", label: "Donacje",     icon: Heart,           permission: () => isAdmin },
    { id: "twitch",    label: "Twitch",      icon: Tv,              permission: () => isAdmin },
    { id: "youtube",   label: "YouTube",     icon: Youtube,         permission: () => isAdmin },
    { id: "alerts",    label: "Stream Alerts", icon: Bell,          permission: () => isAdmin },
    { id: "goals",     label: "Stream Goals", icon: Target,         permission: () => isAdmin },
    { id: "predictions", label: "Predictions", icon: Dice5,         permission: () => can("create_events") },
    { id: "audit",     label: "Audit log",   icon: History,         permission: () => can("view_audit") },
  ];

  const visibleSections = SECTIONS.filter((s) => s.permission());

  // URL hash → active section (deep-linkable: /admin#shop)
  const [activeSection, setActiveSection] = useState<SectionId>("dashboard");
  useEffect(() => {
    const fromHash = () => {
      const raw = window.location.hash.replace(/^#/, "");
      const known = visibleSections.find((s) => s.id === raw);
      setActiveSection(known ? known.id : "dashboard");
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
    // visibleSections recomputed each render — depending on perms, not on every state change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const goToSection = useCallback((id: SectionId) => {
    setActiveSection(id);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.hash = id;
      window.history.replaceState(null, "", url.toString());
    }
  }, []);

  function showToast(kind: "ok" | "err", msg: string) {
    setToast({ kind, msg });
    setTimeout(() => setToast(null), 5000);
  }

  function refresh() {
    startTransition(() => router.refresh());
  }

  const sharedProps = { onToast: showToast, onSuccess: refresh, pending };

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

      {/* Stats — always visible above the sidebar */}
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

      {/* Two-column layout: nav (sidebar / top scroll on mobile) + active section content */}
      <div className="flex flex-col lg:flex-row gap-6">
        <AdminNav
          sections={visibleSections}
          active={activeSection}
          onSelect={goToSection}
        />

        <div className="flex-1 min-w-0 space-y-6">
          {activeSection === "dashboard" && (
            <DashboardSection
              stats={stats}
              drops={drops}
              events={events}
              pendingOrders={pendingOrders}
              onJump={goToSection}
            />
          )}

          {activeSection === "users" && (
            <div className="space-y-6">
              {can("grant_tokens") && <GrantTokensCard {...sharedProps} />}
              {isAdmin && (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                  <UserRolesCard {...sharedProps} />
                  <ConnectionRolesCard {...sharedProps} />
                </div>
              )}
              {!isAdmin && can("mark_subs") && <ConnectionRolesCard {...sharedProps} />}
            </div>
          )}

          {activeSection === "merge" && isAdmin && (
            <MergeUsersSection {...sharedProps} />
          )}

          {activeSection === "events" && (
            <div className="space-y-6">
              {can("create_events") && <CreateEventCard {...sharedProps} />}
              {(can("edit_events") || can("draw_events")) && <ActiveEventsList events={events} {...sharedProps} />}
              {can("edit_events") && <EventManager events={allEvents} {...sharedProps} />}
            </div>
          )}

          {activeSection === "shop" && (
            <div className="space-y-6">
              {can("deliver_orders") && <PendingOrdersList orders={pendingOrders} {...sharedProps} />}
              {can("manage_shop") && <ShopManager items={allShopItems} {...sharedProps} />}
            </div>
          )}

          {activeSection === "drops" && (
            <div className="space-y-6">
              {can("create_drops") && <CreateDropCard {...sharedProps} />}
              {can("create_drops") && <ActiveDropsList drops={drops} {...sharedProps} />}
            </div>
          )}

          {activeSection === "schedule" && can("manage_shop") && (
            <ScheduleManager slots={scheduleSlots} {...sharedProps} />
          )}

          {activeSection === "bot" && can("manage_shop") && (
            <BotConfigCard config={botConfig} {...sharedProps} />
          )}

          {activeSection === "donations" && isAdmin && (
            <StreamlabsManager
              connection={streamlabsConnection}
              unmatchedDonations={unmatchedDonations}
              {...sharedProps}
            />
          )}

          {activeSection === "twitch" && isAdmin && (
            <TwitchEventSubManager data={twitchEventSub} {...sharedProps} />
          )}

          {activeSection === "youtube" && isAdmin && (
            <YouTubeLiveManager {...sharedProps} />
          )}

          {activeSection === "alerts" && isAdmin && (
            <StreamAlertsManager data={streamAlerts} {...sharedProps} />
          )}

          {activeSection === "goals" && isAdmin && (
            <StreamGoalsManager {...sharedProps} />
          )}

          {activeSection === "predictions" && can("create_events") && (
            <PredictionsManager {...sharedProps} />
          )}

          {activeSection === "audit" && can("view_audit") && (
            <AuditLogSection auditLog={auditLog} />
          )}
        </div>
      </div>

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

// ============== ADMIN NAV ==============

function AdminNav<T extends string>({
  sections, active, onSelect,
}: {
  sections: Array<{ id: T; label: string; icon: typeof Users }>;
  active: T;
  onSelect: (id: T) => void;
}) {
  return (
    <aside className="lg:w-56 lg:shrink-0">
      {/* Mobile: horizontal scroll. Desktop: vertical sticky sidebar */}
      <nav
        className={cn(
          "flex lg:flex-col gap-1.5 overflow-x-auto lg:overflow-visible",
          "lg:sticky lg:top-4",
          "border border-zinc-800 bg-zinc-950/70 backdrop-blur-sm p-2",
        )}
        style={{
          clipPath:
            "polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 10px 100%, 0 calc(100% - 10px))",
        }}
      >
        {sections.map((s) => {
          const Icon = s.icon;
          const isActive = s.id === active;
          return (
            <button
              key={s.id}
              onClick={() => onSelect(s.id)}
              className={cn(
                "flex items-center gap-2 px-3 py-2 text-[11px] font-mono uppercase tracking-widest transition-all shrink-0 lg:shrink",
                "border-l-2 lg:border-l-2",
                isActive
                  ? "border-red-600 bg-red-950/40 text-white"
                  : "border-transparent text-zinc-400 hover:text-white hover:bg-zinc-900/60",
              )}
            >
              <Icon className={cn("w-3.5 h-3.5 shrink-0", isActive ? "text-red-400" : "")} />
              <span className="whitespace-nowrap">{s.label}</span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}

// ============== DASHBOARD SECTION ==============

function DashboardSection({
  stats, drops, events, pendingOrders, onJump,
}: {
  stats: Stats;
  drops: Drop[];
  events: AdminEvent[];
  pendingOrders: PendingOrder[];
  onJump: (id: "shop" | "events" | "drops" | "alerts") => void;
}) {
  return (
    <div className="space-y-6">
      <SectionCard title="Skrót — co wymaga uwagi" icon={LayoutDashboard}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <button
            onClick={() => onJump("shop")}
            className={cn(
              "border bg-black/30 p-4 text-left hover:border-red-700 transition-colors",
              stats.ordersPending > 0 ? "border-orange-700 bg-orange-950/20" : "border-zinc-800",
            )}
          >
            <div className="flex items-center gap-2 mb-1">
              <Package className={cn("w-4 h-4", stats.ordersPending > 0 ? "text-orange-400" : "text-zinc-500")} />
              <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">
                Pending orders
              </span>
            </div>
            <div className="text-2xl font-mono font-bold text-white">{fmt(stats.ordersPending)}</div>
            {stats.ordersPending > 0 && (
              <div className="text-[10px] text-orange-300 mt-1">Kliknij żeby dostarczyć</div>
            )}
          </button>

          <button
            onClick={() => onJump("events")}
            className="border border-zinc-800 bg-black/30 p-4 text-left hover:border-red-700 transition-colors"
          >
            <div className="flex items-center gap-2 mb-1">
              <Calendar className="w-4 h-4 text-zinc-500" />
              <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">
                Aktywne eventy
              </span>
            </div>
            <div className="text-2xl font-mono font-bold text-white">{fmt(events.length)}</div>
            <div className="text-[10px] text-zinc-500 mt-1">
              {events.filter((e) => e.type !== "happy_hour").length} z losowaniem
            </div>
          </button>

          <button
            onClick={() => onJump("drops")}
            className="border border-zinc-800 bg-black/30 p-4 text-left hover:border-red-700 transition-colors"
          >
            <div className="flex items-center gap-2 mb-1">
              <Gift className="w-4 h-4 text-zinc-500" />
              <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">
                Aktywne dropy
              </span>
            </div>
            <div className="text-2xl font-mono font-bold text-white">{fmt(drops.length)}</div>
            <div className="text-[10px] text-zinc-500 mt-1">
              {drops.reduce((acc, d) => acc + d.claimsCount, 0)} złapanych łącznie
            </div>
          </button>
        </div>
      </SectionCard>

      <SectionCard title="Skróty" icon={Zap}>
        <p className="text-zinc-500 text-xs mb-3">
          Częste akcje — używaj zakładek po lewej stronie żeby przejść do pełnych narzędzi.
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[10px] font-mono uppercase tracking-widest">
          <a href="#users" onClick={(e) => { e.preventDefault(); onJump("events"); }} className="border border-zinc-800 bg-black/30 p-3 hover:border-red-700 text-zinc-300">
            ▸ Eventy
          </a>
          <a href="#drops" onClick={(e) => { e.preventDefault(); onJump("drops"); }} className="border border-zinc-800 bg-black/30 p-3 hover:border-red-700 text-zinc-300">
            ▸ Nowy drop
          </a>
          <a href="#alerts" onClick={(e) => { e.preventDefault(); onJump("alerts"); }} className="border border-zinc-800 bg-black/30 p-3 hover:border-red-700 text-zinc-300">
            ▸ OBS Alerts
          </a>
          <a href="#shop" onClick={(e) => { e.preventDefault(); onJump("shop"); }} className="border border-zinc-800 bg-black/30 p-3 hover:border-red-700 text-zinc-300">
            ▸ Sklep
          </a>
        </div>
      </SectionCard>

      {pendingOrders.length > 0 && (
        <SectionCard title={`Ostatnie zakupy czekające na dostawę (${pendingOrders.length})`} icon={Package}>
          <div className="space-y-1 text-[10px] font-mono">
            {pendingOrders.slice(0, 5).map((o) => (
              <div key={o.id} className="flex items-center gap-2 border-l-2 border-orange-700 pl-2 py-1">
                <span className="text-orange-300">{o.shopItem?.imageEmoji ?? "📦"} {o.shopItem?.name ?? "?"}</span>
                <span className="text-zinc-500 truncate">
                  {o.user.displayName || o.user.username || o.user.discordUsername || "anon"}
                </span>
                <span className="text-zinc-700 ml-auto shrink-0">
                  {new Date(o.createdAt).toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "short" })}
                </span>
              </div>
            ))}
          </div>
        </SectionCard>
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

// ============== STREAM ALERTS (OBS overlay) ==============

const ALERT_TYPE_LABEL: Record<string, string> = {
  shop_purchase:    "Zakup w sklepie",
  event_win:        "Wygrana w evencie",
  drop_claim_bonus: "Drop bonus claim",
  twitch_sub:       "Twitch — sub",
  twitch_gift_sub:  "Twitch — gifted sub",
  twitch_cheer:     "Twitch — cheer (bits)",
  donation:         "Donacja",
  welcome:          "Welcome / nowy user",
  level_up:         "Level up",
  test:             "Test (Admin)",
};

function StreamAlertsManager({
  data, onToast, onSuccess, pending,
}: {
  data: StreamAlertsData;
  onToast: (k: "ok" | "err", m: string) => void;
  onSuccess: () => void;
  pending: boolean;
}) {
  const [enabledTypes, setEnabledTypes] = useState<string[]>(data.settings.enabledTypes);
  const [durationMs, setDurationMs] = useState(data.settings.durationMs);
  const [accentColor, setAccentColor] = useState(data.settings.accentColor);
  const [soundEnabled, setSoundEnabled] = useState(data.settings.soundEnabled);
  const [busy, setBusy] = useState(false);
  const [tokenVisible, setTokenVisible] = useState(false);
  const [tokenCopied, setTokenCopied] = useState(false);
  const [urlCopied, setUrlCopied] = useState(false);

  const dirty =
    JSON.stringify([...enabledTypes].sort()) !== JSON.stringify([...data.settings.enabledTypes].sort()) ||
    durationMs !== data.settings.durationMs ||
    accentColor !== data.settings.accentColor ||
    soundEnabled !== data.settings.soundEnabled;

  function toggleType(t: string) {
    setEnabledTypes((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t],
    );
  }

  async function saveSettings() {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "settings",
          enabledTypes,
          durationMs,
          accentColor,
          soundEnabled,
        }),
      });
      const result = await res.json();
      if (!res.ok) {
        onToast("err", result.error ?? "Błąd");
      } else {
        onToast("ok", "Zapisano");
        onSuccess();
      }
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test" }),
      });
      const result = await res.json();
      if (!res.ok) onToast("err", result.error ?? "Błąd");
      else onToast("ok", "Wysłano test alert — sprawdź overlay");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SectionCard title="Stream Alerts (OBS Overlay)" icon={Zap}>
      <p className="text-zinc-500 text-xs mb-3">
        Alerty wyświetlane przez OBS Browser Source — pokazują live zakupy, wygrane, suby/bity, donacje.
        Overlay polluje serwer co ~1.2s — alert pojawi się max 1.5s po zdarzeniu.
      </p>

      {/* Overlay token + OBS URL */}
      <div className="border border-zinc-800 bg-black/30 p-3 mb-3 space-y-2">
        {data.overlayToken ? (
          <>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">
                Overlay token (sekret)
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setTokenVisible((v) => !v)}
                  className="text-[10px] font-mono uppercase tracking-widest text-zinc-400 hover:text-white border border-zinc-800 hover:border-zinc-700 px-2 py-0.5 transition-colors flex items-center gap-1"
                  title={tokenVisible ? "Ukryj" : "Pokaż"}
                >
                  {tokenVisible ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                  {tokenVisible ? "Ukryj" : "Pokaż"}
                </button>
                <button
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(data.overlayToken ?? "");
                      setTokenCopied(true);
                      setTimeout(() => setTokenCopied(false), 1500);
                    } catch { onToast("err", "Schowek niedostępny"); }
                  }}
                  className="text-[10px] font-mono uppercase tracking-widest text-zinc-400 hover:text-white border border-zinc-800 hover:border-zinc-700 px-2 py-0.5 transition-colors flex items-center gap-1"
                >
                  <Copy className="w-3 h-3" />
                  {tokenCopied ? "Skopiowano" : "Token"}
                </button>
                <button
                  onClick={async () => {
                    if (!confirm("Wygenerować nowy token? Stare URL-e do OBS przestaną działać — będziesz musiał wkleić nowy URL do OBS Browser Source.")) return;
                    setBusy(true);
                    try {
                      const res = await fetch("/api/admin/alerts", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ action: "regenerate_token" }),
                      });
                      const result = await res.json();
                      if (!res.ok) onToast("err", result.error ?? "Błąd");
                      else { onToast("ok", "Nowy token wygenerowany — wklej nowy URL do OBS"); onSuccess(); }
                    } finally { setBusy(false); }
                  }}
                  disabled={busy || pending}
                  className="text-[10px] font-mono uppercase tracking-widest text-orange-300 hover:text-orange-200 border border-orange-900 hover:border-orange-700 px-2 py-0.5 disabled:opacity-50 transition-colors flex items-center gap-1"
                  title="Rotacja tokena — unieważnia stare URL-e"
                >
                  <Zap className="w-3 h-3" />
                  Wygeneruj nowy
                </button>
              </div>
            </div>
            <div className="font-mono text-[10px] text-zinc-300 break-all bg-black/40 border border-zinc-900 p-2">
              {tokenVisible ? data.overlayToken : "•".repeat(Math.min(data.overlayToken.length, 64))}
            </div>

            <div className="pt-1">
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">
                  URL dla OBS Browser Source
                </span>
                <button
                  onClick={async () => {
                    const url = `${window.location.origin}/overlay?token=${data.overlayToken}`;
                    try {
                      await navigator.clipboard.writeText(url);
                      setUrlCopied(true);
                      setTimeout(() => setUrlCopied(false), 1500);
                    } catch { onToast("err", "Schowek niedostępny"); }
                  }}
                  className="text-[10px] font-mono uppercase tracking-widest text-red-400 hover:text-red-300 border border-red-900 hover:border-red-700 bg-red-950/30 px-2 py-0.5 transition-colors flex items-center gap-1"
                >
                  <Copy className="w-3 h-3" />
                  {urlCopied ? "Skopiowano!" : "Kopiuj URL"}
                </button>
              </div>
              <div className="font-mono text-[10px] text-zinc-400 break-all bg-black/40 border border-zinc-900 p-2">
                {typeof window !== "undefined" ? window.location.origin : "https://ghost-empire-web.vercel.app"}
                /overlay?token={tokenVisible ? data.overlayToken : "•".repeat(8) + "..."}
              </div>
              <p className="text-[10px] text-zinc-500 mt-1.5">
                Wklej ten URL jako <strong>Browser Source</strong> w OBS (rozmiar 1920×1080, transparent background = ON, refresh on activate = ON).
              </p>
            </div>
          </>
        ) : (
          <div className="text-[11px] text-orange-300">
            ⚠ Brak tokena overlay w bazie. Odśwież stronę — powinien się auto-wygenerować przy pierwszym wejściu na sekcję.
          </div>
        )}
      </div>

      {/* Test alert button */}
      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={sendTest}
          disabled={busy || pending}
          className="px-3 py-1.5 bg-red-700 hover:bg-red-600 text-white text-[10px] font-bold tracking-widest uppercase disabled:opacity-50 flex items-center gap-1.5"
        >
          {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
          Wyślij test alert
        </button>
        <span className="text-[10px] text-zinc-500">
          Zobaczysz alert na overlay w ciągu ~1.5s.
        </span>
      </div>

      {/* Settings */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <div className="md:col-span-1">
          <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-1">
            Czas wyświetlania
          </label>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={1500}
              max={20000}
              step={500}
              value={durationMs}
              onChange={(e) => setDurationMs(parseInt(e.target.value, 10))}
              className="flex-1"
            />
            <span className="text-xs text-white font-mono tabular-nums w-14 text-right">
              {(durationMs / 1000).toFixed(1)}s
            </span>
          </div>
        </div>

        <div>
          <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-1">
            Kolor akcentu
          </label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={accentColor}
              onChange={(e) => setAccentColor(e.target.value)}
              className="w-10 h-8 border border-zinc-800 bg-black/30 cursor-pointer"
            />
            <input
              type="text"
              value={accentColor}
              onChange={(e) => setAccentColor(e.target.value)}
              className="flex-1 border border-zinc-800 bg-black/30 px-2 py-1.5 text-xs font-mono text-white outline-none focus:border-red-600"
            />
          </div>
        </div>

        <div>
          <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-1">
            Dźwięk
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={soundEnabled}
              onChange={(e) => setSoundEnabled(e.target.checked)}
              className="w-4 h-4 accent-red-600"
            />
            <span className="text-xs text-zinc-300">
              {soundEnabled ? "Włączony (chime)" : "Wyłączony"}
            </span>
          </label>
        </div>
      </div>

      {/* Per-type toggles */}
      <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-2">
        Aktywne typy alertów ({enabledTypes.length} z {data.allTypes.length})
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 mb-4">
        {data.allTypes.map((t) => {
          const active = enabledTypes.includes(t);
          return (
            <button
              key={t}
              onClick={() => toggleType(t)}
              className={cn(
                "px-2.5 py-1.5 text-[10px] font-mono uppercase tracking-widest border text-left",
                active
                  ? "border-red-700 bg-red-950/30 text-red-200"
                  : "border-zinc-800 bg-black/30 text-zinc-500 hover:border-zinc-700",
              )}
            >
              {active ? "● " : "○ "}
              {ALERT_TYPE_LABEL[t] ?? t}
            </button>
          );
        })}
      </div>

      {/* Save button */}
      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={saveSettings}
          disabled={!dirty || busy || pending}
          className="px-3 py-1.5 bg-purple-700 hover:bg-purple-600 text-white text-[10px] font-bold tracking-widest uppercase disabled:opacity-40 flex items-center gap-1.5"
        >
          {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
          {dirty ? "Zapisz zmiany" : "Brak zmian"}
        </button>
      </div>

      {/* Recent alerts log */}
      {data.recent.length > 0 && (
        <>
          <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-2">
            Ostatnie alerty ({data.recent.length})
          </div>
          <div className="space-y-1 text-[10px] font-mono">
            {data.recent.slice(0, 10).map((a) => (
              <div key={a.id} className="flex items-center gap-2 border-l-2 border-zinc-800 pl-2 py-1">
                <span className="text-zinc-500 uppercase tracking-widest w-28 truncate shrink-0">
                  {ALERT_TYPE_LABEL[a.type] ?? a.type}
                </span>
                <span className="text-zinc-300 truncate flex-1">
                  {a.icon ?? "🔔"} {a.actorName ? <strong>{a.actorName}</strong> : null} {a.message}
                </span>
                {a.amount != null && (
                  <span className="text-red-400 shrink-0">
                    {a.amount.toLocaleString("pl-PL")}{a.amountLabel ? ` ${a.amountLabel}` : ""}
                  </span>
                )}
                <span
                  className={cn(
                    "shrink-0 text-[9px] uppercase tracking-widest",
                    a.shownAt ? "text-zinc-600" : "text-orange-400",
                  )}
                  title={a.shownAt ? `Pokazany ${new Date(a.shownAt).toLocaleTimeString("pl-PL")}` : "Jeszcze nie pokazany"}
                >
                  {a.shownAt ? "shown" : "pending"}
                </span>
                <span className="text-zinc-700 shrink-0">
                  {new Date(a.createdAt).toLocaleTimeString("pl-PL")}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </SectionCard>
  );
}

// ============== MERGE DUPLICATES ==============

const MERGE_REASON_LABEL: Record<string, string> = {
  shared_platform_id: "Wspólne konto OAuth (najsilniejszy sygnał)",
  shared_email: "Wspólny email",
  shared_discord_id: "Wspólny Discord ID",
};

type MergeUser = {
  id: string;
  username: string | null;
  displayName: string | null;
  email: string | null;
  image: string | null;
  discordId: string | null;
  tokens: number;
  totalEarned: number;
  totalDonated: number;
  level: number;
  isAdmin: boolean;
  isModerator: boolean;
  isBanned: boolean;
  createdAt: string;
  accountsCount: number;
  connectionsCount: number;
  transactionsCount: number;
  donationsCount: number;
  achievementsCount: number;
  connections: Array<{ platform: string; username: string }>;
};

type MergeGroup = {
  reason: keyof typeof MERGE_REASON_LABEL;
  matchOn: string;
  users: MergeUser[];
};

type MergePreview = {
  primary: { id: string; username: string | null; tokens: number };
  secondary: { id: string; username: string | null; tokens: number };
  willMove: Record<string, number>;
  conflicts: {
    accountProviders: string[];
    connectionPlatforms: string[];
    achievements: number;
    socialLinks: number;
    eventEntries: number;
    dropClaims: number;
  };
  finalPrimaryTokens: number;
};

function MergeUsersSection({
  onToast, onSuccess, pending,
}: {
  onToast: (k: "ok" | "err", m: string) => void;
  onSuccess: () => void;
  pending: boolean;
}) {
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState<MergeGroup[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/merge-users");
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Nie udało się załadować grup duplikatów");
        setGroups([]);
      } else {
        setGroups(data.groups ?? []);
      }
    } catch {
      setError("Błąd sieci");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <SectionCard title="Merge duplikatów" icon={GitMerge}>
      <div className="border border-orange-900 bg-orange-950/20 px-3 py-2.5 text-xs text-orange-200 mb-4 flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-orange-400" />
        <div>
          <strong>Operacja destrukcyjna</strong> — drugie konto zostaje całkowicie usunięte po przeniesieniu danych do primary. Działanie jest atomowe (jeden DB transaction) ale nieodwracalne.
        </div>
      </div>

      <div className="flex items-center gap-2 mb-3">
        <button
          onClick={load}
          disabled={loading || pending}
          className="text-[10px] font-mono uppercase tracking-widest border border-zinc-700 hover:border-red-700 text-zinc-300 hover:text-white px-2.5 py-1.5 transition-colors flex items-center gap-1.5 disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <History className="w-3 h-3" />}
          Skanuj ponownie
        </button>
        <span className="text-[10px] text-zinc-500">
          Wykrywanie: ten sam OAuth provider account ID, email, lub Discord ID.
        </span>
      </div>

      {error && (
        <div className="border border-red-700 bg-red-950/40 px-3 py-2 text-xs text-red-200 mb-3">
          {error}
        </div>
      )}

      {!loading && !error && groups.length === 0 && (
        <div className="border border-zinc-800 bg-black/30 p-6 text-center text-zinc-500 text-sm">
          ✓ Brak wykrytych duplikatów — czyściutko.
        </div>
      )}

      <div className="space-y-4">
        {groups.map((g, i) => (
          <DuplicateGroupCard
            key={`${g.reason}-${i}`}
            group={g}
            onToast={onToast}
            onSuccess={() => { onSuccess(); void load(); }}
          />
        ))}
      </div>
    </SectionCard>
  );
}

function DuplicateGroupCard({
  group, onToast, onSuccess,
}: {
  group: MergeGroup;
  onToast: (k: "ok" | "err", m: string) => void;
  onSuccess: () => void;
}) {
  // Pick primary by default = the user with most tokens (likely the "real" account)
  const defaultPrimaryId = group.users.reduce((acc, u) => (u.tokens > acc.tokens ? u : acc), group.users[0]).id;
  const [primaryId, setPrimaryId] = useState<string>(defaultPrimaryId);
  const [secondaryId, setSecondaryId] = useState<string>(
    group.users.find((u) => u.id !== defaultPrimaryId)?.id ?? "",
  );
  const [preview, setPreview] = useState<MergePreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [executing, setExecuting] = useState(false);

  const secondary = group.users.find((u) => u.id === secondaryId);
  const expectedConfirm = secondary?.username ?? "";

  async function loadPreview() {
    if (!secondaryId || primaryId === secondaryId) return;
    setPreviewing(true);
    setPreview(null);
    try {
      const res = await fetch("/api/admin/merge-users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "preview", primary: primaryId, secondary: secondaryId }),
      });
      const data = await res.json();
      if (!res.ok) onToast("err", data.error ?? "Preview failed");
      else setPreview(data);
    } finally {
      setPreviewing(false);
    }
  }

  async function execute() {
    if (confirmText.trim() !== expectedConfirm) {
      onToast("err", "Wpisz dokładny username drugiego konta żeby potwierdzić");
      return;
    }
    setExecuting(true);
    try {
      const res = await fetch("/api/admin/merge-users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "execute",
          primary: primaryId,
          secondary: secondaryId,
          confirm: confirmText.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        onToast("err", data.error ?? "Merge failed");
      } else {
        onToast("ok", `Scalono. Przeniesione: ${data.summary.tokens} GT, ${data.summary.transactions} txn`);
        setPreview(null);
        setConfirmText("");
        onSuccess();
      }
    } finally {
      setExecuting(false);
    }
  }

  return (
    <div className="border border-zinc-800 bg-black/40 p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[10px] font-mono uppercase tracking-widest px-2 py-0.5 border border-red-700 bg-red-950/30 text-red-300">
          {MERGE_REASON_LABEL[group.reason]}
        </span>
        <span className="text-[10px] font-mono text-zinc-500">{group.matchOn}</span>
      </div>

      {/* User comparison */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
        {group.users.map((u) => {
          const isPrim = u.id === primaryId;
          const isSec = u.id === secondaryId;
          return (
            <div
              key={u.id}
              className={cn(
                "border p-3 cursor-pointer transition-colors",
                isPrim ? "border-green-700 bg-green-950/20" :
                isSec ? "border-orange-700 bg-orange-950/20" :
                "border-zinc-800 bg-black/30 hover:border-zinc-600",
              )}
              onClick={() => {
                // Click cycles role: primary → secondary → unselected → primary
                if (isPrim) {
                  // Make this secondary, pick another as primary
                  const other = group.users.find((x) => x.id !== u.id);
                  if (other) {
                    setPrimaryId(other.id);
                    setSecondaryId(u.id);
                    setPreview(null);
                  }
                } else if (isSec) {
                  setSecondaryId("");
                  setPreview(null);
                } else {
                  setSecondaryId(u.id);
                  setPreview(null);
                }
              }}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  {u.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={u.image} alt="" className="w-8 h-8 rounded-full border border-zinc-800" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-zinc-900 border border-zinc-800" />
                  )}
                  <div>
                    <div className="text-sm font-bold text-white">{u.displayName || u.username || u.id.slice(-6)}</div>
                    <div className="text-[10px] font-mono text-zinc-500">@{u.username ?? "?"}</div>
                  </div>
                </div>
                <div>
                  {isPrim && <span className="text-[9px] font-mono uppercase tracking-widest px-1.5 py-0.5 border border-green-700 bg-green-950/40 text-green-300">Primary</span>}
                  {isSec  && <span className="text-[9px] font-mono uppercase tracking-widest px-1.5 py-0.5 border border-orange-700 bg-orange-950/40 text-orange-300">Secondary</span>}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] font-mono">
                <div className="text-zinc-500">Tokens</div>
                <div className="text-white text-right">{u.tokens.toLocaleString("pl-PL")}</div>
                <div className="text-zinc-500">Earned</div>
                <div className="text-white text-right">{u.totalEarned.toLocaleString("pl-PL")}</div>
                <div className="text-zinc-500">Donated</div>
                <div className="text-white text-right">{(u.totalDonated / 100).toFixed(2)} PLN</div>
                <div className="text-zinc-500">Level</div>
                <div className="text-white text-right">{u.level}</div>
                <div className="text-zinc-500">Transactions</div>
                <div className="text-white text-right">{u.transactionsCount}</div>
                <div className="text-zinc-500">Achievements</div>
                <div className="text-white text-right">{u.achievementsCount}</div>
                <div className="text-zinc-500">Accounts</div>
                <div className="text-white text-right">{u.accountsCount}</div>
                <div className="text-zinc-500">Connections</div>
                <div className="text-white text-right">{u.connectionsCount}</div>
                <div className="text-zinc-500">Utworzone</div>
                <div className="text-white text-right">{new Date(u.createdAt).toLocaleDateString("pl-PL")}</div>
              </div>

              {(u.isAdmin || u.isModerator || u.isBanned) && (
                <div className="flex gap-1 mt-2">
                  {u.isAdmin     && <span className="text-[9px] px-1.5 py-0.5 border border-red-700 bg-red-950/40 text-red-300">ADMIN</span>}
                  {u.isModerator && <span className="text-[9px] px-1.5 py-0.5 border border-blue-700 bg-blue-950/40 text-blue-300">MOD</span>}
                  {u.isBanned    && <span className="text-[9px] px-1.5 py-0.5 border border-zinc-700 bg-black/40 text-zinc-400">BANNED</span>}
                </div>
              )}

              {u.connections.length > 0 && (
                <div className="mt-2 text-[10px] text-zinc-500">
                  Platformy: {u.connections.map((c) => `${c.platform}=${c.username}`).join(", ")}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Preview + execute */}
      {primaryId && secondaryId && primaryId !== secondaryId && (
        <div className="border border-zinc-800 bg-black/50 p-3 space-y-3">
          {!preview ? (
            <button
              onClick={loadPreview}
              disabled={previewing}
              className="text-[10px] font-mono uppercase tracking-widest border border-zinc-700 hover:border-red-700 text-zinc-200 hover:text-white px-3 py-1.5 transition-colors flex items-center gap-1.5 disabled:opacity-50"
            >
              {previewing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Eye className="w-3 h-3" />}
              Pokaż preview merge
            </button>
          ) : (
            <>
              <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">
                Co się przeniesie z @{preview.secondary.username} → @{preview.primary.username}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1 text-[11px] font-mono">
                {Object.entries(preview.willMove).map(([k, v]) => (
                  <div key={k} className="flex justify-between">
                    <span className="text-zinc-500">{k}</span>
                    <span className="text-white">{v}</span>
                  </div>
                ))}
              </div>
              <div className="text-[11px] text-zinc-400">
                Tokeny po scaleniu: <strong className="text-white">{preview.finalPrimaryTokens.toLocaleString("pl-PL")} GT</strong>
              </div>

              {(preview.conflicts.accountProviders.length > 0 ||
                preview.conflicts.connectionPlatforms.length > 0 ||
                preview.conflicts.achievements > 0 ||
                preview.conflicts.socialLinks > 0 ||
                preview.conflicts.eventEntries > 0 ||
                preview.conflicts.dropClaims > 0) && (
                <div className="border border-orange-900 bg-orange-950/20 p-2 text-[11px] text-orange-200">
                  <div className="font-bold mb-1">⚠ Konflikty (zostają wersje primary):</div>
                  {preview.conflicts.accountProviders.length > 0 && (
                    <div>Account providers: {preview.conflicts.accountProviders.join(", ")}</div>
                  )}
                  {preview.conflicts.connectionPlatforms.length > 0 && (
                    <div>Connection platforms: {preview.conflicts.connectionPlatforms.join(", ")}</div>
                  )}
                  {preview.conflicts.achievements > 0 && <div>Achievements: {preview.conflicts.achievements}</div>}
                  {preview.conflicts.socialLinks > 0 && <div>Social links: {preview.conflicts.socialLinks}</div>}
                  {preview.conflicts.eventEntries > 0 && <div>Event entries: {preview.conflicts.eventEntries}</div>}
                  {preview.conflicts.dropClaims > 0 && <div>Drop claims: {preview.conflicts.dropClaims}</div>}
                </div>
              )}

              <div className="border-t border-zinc-800 pt-3">
                <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-1">
                  Potwierdzenie — wpisz username drugiego konta:{" "}
                  <code className="text-orange-300">{expectedConfirm}</code>
                </label>
                <div className="flex items-center gap-2">
                  <input
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    placeholder={expectedConfirm}
                    className="flex-1 border border-zinc-700 bg-black/40 px-2.5 py-1.5 text-xs text-white font-mono outline-none focus:border-red-600"
                  />
                  <button
                    onClick={execute}
                    disabled={executing || confirmText.trim() !== expectedConfirm}
                    className="text-[10px] font-mono uppercase tracking-widest bg-red-700 hover:bg-red-600 text-white px-3 py-1.5 transition-colors flex items-center gap-1.5 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    {executing ? <Loader2 className="w-3 h-3 animate-spin" /> : <GitMerge className="w-3 h-3" />}
                    Scal teraz
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ============== YOUTUBE LIVE CHAT MANAGER ==============

type YTStatus = {
  ok: boolean;
  streamerConnected: boolean;
  channelTitle: string | null;
  currentLiveVideoId: string | null;
  lastPolledAt: string | null;
};

type YTPollResult = {
  ok: boolean;
  status?: string;
  rediscovered?: boolean;
  videoId?: string;
  messagesFetched?: number;
  superChatsProcessed?: number;
  memberEventsProcessed?: number;
  messagesLogged?: number;
  nextPollSuggestedMs?: number;
  error?: string;
};

function YouTubeLiveManager({
  onToast, onSuccess, pending,
}: {
  onToast: (k: "ok" | "err", m: string) => void;
  onSuccess: () => void;
  pending: boolean;
}) {
  const [status, setStatus] = useState<YTStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [polling, setPolling] = useState(false);
  const [lastResult, setLastResult] = useState<YTPollResult | null>(null);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/yt/poll-live-chat", { method: "GET" });
      const data = await res.json();
      setStatus(data);
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadStatus(); }, [loadStatus]);

  async function pollNow() {
    setPolling(true);
    setLastResult(null);
    try {
      const res = await fetch("/api/yt/poll-live-chat", { method: "POST" });
      const data: YTPollResult = await res.json();
      setLastResult(data);
      if (!res.ok) {
        onToast("err", data.error ?? "Polling failed");
      } else {
        if (data.status === "no_active_broadcast") {
          onToast("ok", "Nie ma aktywnej transmisji live");
        } else if (data.status === "chat_ended") {
          onToast("ok", "Stream skończył się — cache wyczyszczony");
        } else {
          onToast("ok", `Pobrane: ${data.messagesFetched ?? 0} wiadomości, ${data.superChatsProcessed ?? 0} super chat`);
        }
        await loadStatus();
        onSuccess();
      }
    } finally {
      setPolling(false);
    }
  }

  return (
    <SectionCard title="YouTube Live Chat (Super Chats + Members)" icon={Youtube}>
      <p className="text-zinc-500 text-xs mb-3">
        Wykrywa Super Chats i nowych członków na YouTube live → grant Ghost Tokens
        donatorowi, zapisuje donejt, triggeruje stream alert na OBS overlay.
      </p>

      {/* Connection status */}
      <div className="border border-zinc-800 bg-black/30 p-3 mb-3">
        {loading ? (
          <div className="text-xs text-zinc-500 flex items-center gap-2">
            <Loader2 className="w-3 h-3 animate-spin" /> Ładowanie…
          </div>
        ) : status?.streamerConnected ? (
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold text-green-300 mb-0.5 flex items-center gap-1.5">
                <Radio className="w-3.5 h-3.5" />
                Streamer autoryzowany: {status.channelTitle}
              </div>
              <div className="text-[10px] font-mono text-zinc-500">
                {status.currentLiveVideoId ? (
                  <>Live video: <code className="text-zinc-300">{status.currentLiveVideoId}</code></>
                ) : (
                  "Brak cache live video — następny poll wyszuka"
                )}
                {status.lastPolledAt && (
                  <> · Ostatni poll: {new Date(status.lastPolledAt).toLocaleTimeString("pl-PL")}</>
                )}
              </div>
            </div>
            <a
              href="/api/admin/youtube-streamer-auth"
              className="px-3 py-1.5 border border-zinc-700 hover:border-zinc-500 text-zinc-300 text-[10px] font-bold tracking-widest uppercase"
            >
              Re-autoryzuj
            </a>
          </div>
        ) : (
          <div className="text-center py-2">
            <p className="text-zinc-400 text-sm mb-3">
              YouTube nie autoryzowany. Zaloguj się jako <strong>właściciel kanału Gh0s77tt</strong> żeby nadać Ghost Empire dostęp read-only do live chatu.
            </p>
            <a
              href="/api/admin/youtube-streamer-auth"
              className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-xs font-bold tracking-widest uppercase"
            >
              <Youtube className="w-3.5 h-3.5" />
              Autoryzuj YouTube
            </a>
          </div>
        )}
      </div>

      {/* Manual poll + result */}
      {status?.streamerConnected && (
        <>
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <button
              onClick={pollNow}
              disabled={polling || pending}
              className="px-3 py-1.5 bg-red-700 hover:bg-red-600 text-white text-[10px] font-bold tracking-widest uppercase disabled:opacity-50 flex items-center gap-1.5"
            >
              {polling ? <Loader2 className="w-3 h-3 animate-spin" /> : <Radio className="w-3 h-3" />}
              Poll now
            </button>
            <button
              onClick={loadStatus}
              disabled={loading || pending}
              className="px-3 py-1.5 border border-zinc-700 hover:border-zinc-500 text-zinc-300 text-[10px] font-bold tracking-widest uppercase disabled:opacity-50"
            >
              Odśwież status
            </button>
            <span className="text-[10px] text-zinc-500">
              Manual poll dla testu. Dla auto-pollingu setuj external cron (poniżej).
            </span>
          </div>

          {lastResult && (
            <div className="border border-zinc-800 bg-black/30 p-3 mb-3 text-[10px] font-mono">
              <div className="text-zinc-500 uppercase tracking-widest mb-1">Ostatni poll result</div>
              <pre className="text-zinc-300 whitespace-pre-wrap break-all">
                {JSON.stringify(lastResult, null, 2)}
              </pre>
            </div>
          )}

          {/* External cron setup instructions */}
          <div className="border border-zinc-800 bg-black/30 p-3 text-xs space-y-2">
            <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">
              Setup auto-polling (zalecane)
            </div>
            <p className="text-zinc-400">
              Vercel Hobby plan obsługuje tylko daily cron — dla pollingu co minutę użyj zewnętrznego serwisu:
            </p>
            <ol className="text-zinc-400 list-decimal pl-5 space-y-1">
              <li>
                Wejdź na <a href="https://cron-job.org" target="_blank" rel="noreferrer" className="text-red-400 underline">cron-job.org</a> (free)
              </li>
              <li>
                Stwórz nowy job z URL: <code className="text-zinc-200 text-[10px]">{typeof window !== "undefined" ? window.location.origin : ""}/api/yt/poll-live-chat</code>
              </li>
              <li>
                Method: <strong>POST</strong>, schedule: <strong>co 30s</strong> (lub 1 min jeśli oszczędzasz quota)
              </li>
              <li>
                Add header: <code className="text-zinc-200">Authorization: Bearer &lt;BOT_SECRET&gt;</code> (ten sam co Discord bot używa)
              </li>
              <li>
                Save → status zaczyna się polować automatycznie
              </li>
            </ol>
            <p className="text-zinc-500 text-[10px] italic">
              YouTube Data API quota: 10,000 jednostek/dzień. Polling co 30s przez 3h streama ≈ 1800 jednostek (sporo headroomu). Polluj tylko podczas live żeby oszczędzać quota.
            </p>
          </div>
        </>
      )}
    </SectionCard>
  );
}

// ============== STREAM GOALS ==============

const GOAL_TYPE_LABEL: Record<string, string> = {
  subs:          "Subskrypcje",
  gift_subs:     "Gifted Subs",
  follows:       "Followsy",
  donations_pln: "Donacje (PLN)",
  cheers_bits:   "Cheery (bits)",
  yt_members:    "YouTube Members",
};

const RESET_MODE_LABEL: Record<string, string> = {
  manual:     "Ręczny",
  per_stream: "Co stream",
  daily:      "Codziennie",
  weekly:     "Co tydzień",
  monthly:    "Co miesiąc",
};

type StreamGoalData = {
  id: string;
  type: string;
  label: string;
  current: number;
  target: number;
  active: boolean;
  resetMode: string;
  color: string | null;
  sortOrder: number;
  completedAt: string | null;
  createdAt: string;
};

type HypeTrainData = {
  active: boolean;
  level: number;
  goal: number;
  total: number;
  topContributor: string | null;
  startedAt: string | null;
  expiresAt: string | null;
  endedAt: string | null;
};

function StreamGoalsManager({
  onToast, onSuccess, pending,
}: {
  onToast: (k: "ok" | "err", m: string) => void;
  onSuccess: () => void;
  pending: boolean;
}) {
  const [loading, setLoading] = useState(true);
  const [goals, setGoals] = useState<StreamGoalData[]>([]);
  const [hypeTrain, setHypeTrain] = useState<HypeTrainData | null>(null);
  const [validTypes, setValidTypes] = useState<string[]>([]);
  const [validResetModes, setValidResetModes] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  // Create form state
  const [newType, setNewType] = useState("subs");
  const [newLabel, setNewLabel] = useState("");
  const [newTarget, setNewTarget] = useState("100");
  const [newColor, setNewColor] = useState("");
  const [newResetMode, setNewResetMode] = useState("manual");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/stream-goals");
      const data = await res.json();
      if (res.ok) {
        setGoals(data.goals ?? []);
        setHypeTrain(data.hypeTrain ?? null);
        setValidTypes(data.validTypes ?? []);
        setValidResetModes(data.validResetModes ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function call(action: string, payload: Record<string, unknown>) {
    const res = await fetch("/api/admin/stream-goals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...payload }),
    });
    const data = await res.json();
    if (!res.ok) {
      onToast("err", data.error ?? "Błąd");
      return false;
    }
    return true;
  }

  async function createGoal() {
    const target = parseInt(newTarget, 10);
    if (!newLabel.trim() || !target || target < 1) {
      onToast("err", "Wpisz label i target > 0");
      return;
    }
    setBusy("create");
    const ok = await call("create", {
      type: newType,
      label: newLabel.trim(),
      target,
      color: newColor || undefined,
      resetMode: newResetMode,
    });
    if (ok) {
      setNewLabel(""); setNewTarget("100"); setNewColor("");
      onToast("ok", "Cel utworzony");
      await load();
      onSuccess();
    }
    setBusy(null);
  }

  async function toggleActive(g: StreamGoalData) {
    setBusy(g.id);
    if (await call("update", { id: g.id, active: !g.active })) await load();
    setBusy(null);
  }

  async function resetGoal(g: StreamGoalData) {
    if (!confirm(`Reset celu "${g.label}" do 0?`)) return;
    setBusy(g.id);
    if (await call("reset", { id: g.id })) { onToast("ok", "Wyzerowano"); await load(); }
    setBusy(null);
  }

  async function deleteGoal(g: StreamGoalData) {
    if (!confirm(`Usunąć cel "${g.label}"?`)) return;
    setBusy(g.id);
    if (await call("delete", { id: g.id })) { onToast("ok", "Usunięto"); await load(); }
    setBusy(null);
  }

  async function bumpCurrent(g: StreamGoalData, delta: number) {
    setBusy(g.id);
    if (await call("update", { id: g.id, current: Math.max(0, g.current + delta) })) await load();
    setBusy(null);
  }

  return (
    <SectionCard title="Stream Goals + Hype Train" icon={Target}>
      <p className="text-zinc-500 text-xs mb-3">
        Cele wyświetlane na OBS overlay (URL: <code className="text-zinc-300">/overlay/goals?token=&lt;OVERLAY_TOKEN&gt;</code>).
        Auto-inkrementowane przez Twitch EventSub (subs/gifts/cheers), Streamlabs (donacje PLN), YouTube super chats + members.
      </p>

      {/* Hype Train status */}
      <div className="border border-zinc-800 bg-black/30 p-3 mb-3">
        <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-1">
          🚂 Hype Train
        </div>
        {hypeTrain && hypeTrain.active ? (
          <div className="text-sm">
            <span className="text-yellow-300 font-bold">AKTYWNY</span> — Level {hypeTrain.level} ·
            {" "}{hypeTrain.total.toLocaleString("pl-PL")} / {hypeTrain.goal.toLocaleString("pl-PL")} pkt
            {hypeTrain.topContributor && <> · Top: <strong>{hypeTrain.topContributor}</strong></>}
            {hypeTrain.expiresAt && (
              <span className="text-[10px] text-zinc-500 ml-2">
                expiry {new Date(hypeTrain.expiresAt).toLocaleTimeString("pl-PL")}
              </span>
            )}
          </div>
        ) : (
          <div className="text-xs text-zinc-500">
            Nieaktywny. {hypeTrain?.endedAt && <>Ostatni: Level {hypeTrain.level} ({new Date(hypeTrain.endedAt).toLocaleString("pl-PL")})</>}
            {!hypeTrain && <> — Twitch EventSub musi mieć subskrypcję <code>channel.hype_train.*</code> (zostaną dodane przy następnym &quot;Setup&quot; w sekcji Twitch).</>}
          </div>
        )}
      </div>

      {/* Goals list */}
      {loading ? (
        <div className="text-xs text-zinc-500 flex items-center gap-2 mb-3"><Loader2 className="w-3 h-3 animate-spin" /> Ładowanie…</div>
      ) : (
        <div className="space-y-2 mb-4">
          {goals.length === 0 ? (
            <div className="text-xs text-zinc-500 text-center py-4 border border-zinc-900 bg-black/20">
              Brak celów. Dodaj pierwszy poniżej.
            </div>
          ) : (
            goals.map((g) => {
              const pct = Math.min(100, (g.current / Math.max(1, g.target)) * 100);
              const color = g.color ?? "#E50914";
              return (
                <div
                  key={g.id}
                  className={cn(
                    "border bg-black/30 p-3",
                    g.active ? "border-zinc-800" : "border-zinc-900 opacity-60",
                  )}
                >
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span className="text-[9px] font-mono uppercase tracking-widest px-1.5 py-0.5 border" style={{ borderColor: color, color }}>
                        {GOAL_TYPE_LABEL[g.type] ?? g.type}
                      </span>
                      <span className="text-sm text-white truncate">{g.label}</span>
                      {g.completedAt && (
                        <span className="text-[9px] font-mono uppercase tracking-widest px-1.5 py-0.5 border border-green-700 bg-green-950/40 text-green-300">
                          ✓ DONE
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => bumpCurrent(g, -1)}
                        disabled={busy === g.id || pending}
                        className="text-zinc-500 hover:text-white border border-zinc-800 hover:border-zinc-600 w-6 h-6 flex items-center justify-center text-xs"
                        title="−1"
                      >−</button>
                      <button
                        onClick={() => bumpCurrent(g, 1)}
                        disabled={busy === g.id || pending}
                        className="text-zinc-500 hover:text-white border border-zinc-800 hover:border-zinc-600 w-6 h-6 flex items-center justify-center text-xs"
                        title="+1"
                      >+</button>
                      <button
                        onClick={() => toggleActive(g)}
                        disabled={busy === g.id || pending}
                        className="text-zinc-500 hover:text-white border border-zinc-800 hover:border-zinc-600 px-2 h-6 text-[9px] font-mono uppercase"
                        title={g.active ? "Wyłącz" : "Włącz"}
                      >
                        {g.active ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                      </button>
                      <button
                        onClick={() => resetGoal(g)}
                        disabled={busy === g.id || pending}
                        className="text-zinc-500 hover:text-orange-400 border border-zinc-800 hover:border-orange-700 w-6 h-6 flex items-center justify-center"
                        title="Reset"
                      >
                        <RefreshCw className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => deleteGoal(g)}
                        disabled={busy === g.id || pending}
                        className="text-red-500 hover:text-red-400 border border-zinc-800 hover:border-red-700 w-6 h-6 flex items-center justify-center"
                        title="Usuń"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-1.5 bg-zinc-900 rounded overflow-hidden">
                      <div className="h-full transition-all" style={{ width: `${pct}%`, background: color }} />
                    </div>
                    <span className="text-[11px] font-mono text-white tabular-nums shrink-0">
                      {g.current.toLocaleString("pl-PL")} / {g.target.toLocaleString("pl-PL")}
                      <span className="text-zinc-500 ml-1">({pct.toFixed(0)}%)</span>
                    </span>
                  </div>
                  <div className="text-[10px] text-zinc-600 mt-1">
                    Reset: {RESET_MODE_LABEL[g.resetMode] ?? g.resetMode}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Create new goal */}
      <div className="border border-zinc-800 bg-black/30 p-3">
        <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-2">
          Dodaj nowy cel
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-2">
          <div>
            <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-0.5">Typ</label>
            <select
              value={newType}
              onChange={(e) => setNewType(e.target.value)}
              className="w-full border border-zinc-700 bg-black/40 px-2 py-1.5 text-xs text-white outline-none focus:border-red-600"
            >
              {validTypes.map((t) => (
                <option key={t} value={t}>{GOAL_TYPE_LABEL[t] ?? t}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-0.5">Reset</label>
            <select
              value={newResetMode}
              onChange={(e) => setNewResetMode(e.target.value)}
              className="w-full border border-zinc-700 bg-black/40 px-2 py-1.5 text-xs text-white outline-none focus:border-red-600"
            >
              {validResetModes.map((m) => (
                <option key={m} value={m}>{RESET_MODE_LABEL[m] ?? m}</option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-0.5">Label (widoczny na overlay)</label>
            <input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="np. 500 subów = nowy setup!"
              className="w-full border border-zinc-700 bg-black/40 px-2 py-1.5 text-xs text-white outline-none focus:border-red-600"
            />
          </div>
          <div>
            <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-0.5">Target</label>
            <input
              type="number"
              min={1}
              value={newTarget}
              onChange={(e) => setNewTarget(e.target.value)}
              className="w-full border border-zinc-700 bg-black/40 px-2 py-1.5 text-xs text-white font-mono outline-none focus:border-red-600"
            />
          </div>
          <div>
            <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-0.5">Kolor (opcjonalny)</label>
            <div className="flex items-center gap-1.5">
              <input
                type="color"
                value={newColor || "#E50914"}
                onChange={(e) => setNewColor(e.target.value)}
                className="w-9 h-7 border border-zinc-700 bg-black/40 cursor-pointer"
              />
              <input
                value={newColor}
                onChange={(e) => setNewColor(e.target.value)}
                placeholder="#hex (puste = domyślny)"
                className="flex-1 border border-zinc-700 bg-black/40 px-2 py-1.5 text-xs text-white font-mono outline-none focus:border-red-600"
              />
            </div>
          </div>
        </div>
        <button
          onClick={createGoal}
          disabled={busy === "create" || pending}
          className="px-3 py-1.5 bg-red-700 hover:bg-red-600 text-white text-[10px] font-bold tracking-widest uppercase disabled:opacity-50 flex items-center gap-1.5"
        >
          {busy === "create" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
          Dodaj cel
        </button>
      </div>
    </SectionCard>
  );
}

// ============== PREDICTIONS ==============

type PredictionRow = {
  id: string;
  question: string;
  options: string[];
  status: string;
  resolvedOptionIndex: number | null;
  totalPot: number;
  opensAt: string;
  closesAt: string | null;
  resolvedAt: string | null;
  entriesCount: number;
  breakdown: Array<{ index: number; total: number; count: number }>;
};

function PredictionsManager({
  onToast, onSuccess, pending,
}: {
  onToast: (k: "ok" | "err", m: string) => void;
  onSuccess: () => void;
  pending: boolean;
}) {
  const [loading, setLoading] = useState(true);
  const [predictions, setPredictions] = useState<PredictionRow[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  // Create form
  const [newQuestion, setNewQuestion] = useState("");
  const [newOptions, setNewOptions] = useState<string[]>(["", ""]);
  const [newClosesIn, setNewClosesIn] = useState("");  // minutes from now, optional

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/predictions");
      const data = await res.json();
      if (res.ok) setPredictions(data.predictions ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function call(action: string, payload: Record<string, unknown>): Promise<boolean> {
    const res = await fetch("/api/admin/predictions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...payload }),
    });
    const data = await res.json();
    if (!res.ok) { onToast("err", data.error ?? "Błąd"); return false; }
    return true;
  }

  async function createPrediction() {
    const cleanOptions = newOptions.map((o) => o.trim()).filter((o) => o.length > 0);
    if (newQuestion.trim().length < 5) { onToast("err", "Pytanie min 5 znaków"); return; }
    if (cleanOptions.length < 2) { onToast("err", "Min 2 opcje"); return; }

    let closesAt: string | undefined;
    const min = parseInt(newClosesIn, 10);
    if (min > 0) closesAt = new Date(Date.now() + min * 60_000).toISOString();

    setBusy("create");
    const ok = await call("create", {
      question: newQuestion.trim(),
      options: cleanOptions,
      closesAt,
    });
    if (ok) {
      setNewQuestion("");
      setNewOptions(["", ""]);
      setNewClosesIn("");
      onToast("ok", "Zakład utworzony");
      await load();
      onSuccess();
    }
    setBusy(null);
  }

  async function lock(p: PredictionRow) {
    if (!confirm(`Zablokować obstawianie zakładu "${p.question}"?`)) return;
    setBusy(p.id);
    if (await call("lock", { id: p.id })) { onToast("ok", "Zablokowany"); await load(); }
    setBusy(null);
  }

  async function resolve(p: PredictionRow, winningOptionIndex: number) {
    if (!confirm(`Rozstrzygnąć: wygrana opcja "${p.options[winningOptionIndex]}"?\n\nPula ${p.totalPot} GT zostanie podzielona między zwycięzców proporcjonalnie do stawek.`)) return;
    setBusy(p.id);
    const res = await fetch("/api/admin/predictions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "resolve", id: p.id, winningOptionIndex }),
    });
    const data = await res.json();
    if (!res.ok) onToast("err", data.error ?? "Błąd");
    else {
      onToast("ok", data.refunded
        ? `Brak zwycięzców — pełen zwrot (${data.losersCount} graczy)`
        : `Wypłacono: ${data.winnersCount} wygrywających, ${data.potDistributed} GT z puli`,
      );
      await load();
      onSuccess();
    }
    setBusy(null);
  }

  async function cancel(p: PredictionRow) {
    if (!confirm(`Anulować zakład i zwrócić wszystkim stawki?`)) return;
    setBusy(p.id);
    if (await call("cancel", { id: p.id })) { onToast("ok", "Anulowano + zwrot"); await load(); }
    setBusy(null);
  }

  async function deletePrediction(p: PredictionRow) {
    if (!confirm(`Usunąć ten zakład z bazy?`)) return;
    setBusy(p.id);
    if (await call("delete", { id: p.id })) { onToast("ok", "Usunięto"); await load(); }
    setBusy(null);
  }

  return (
    <SectionCard title="Predictions / Zakłady" icon={Dice5}>
      <p className="text-zinc-500 text-xs mb-3">
        Twórz pytania, widzowie obstawiają Ghost Tokens. Pula = suma wszystkich stawek. Po rozstrzygnięciu wygrywająca opcja dzieli pulę proporcjonalnie do stawek. Brak zwycięzców → zwrot wszystkim.
      </p>

      {/* Active predictions */}
      {loading ? (
        <div className="text-xs text-zinc-500 flex items-center gap-2 mb-3"><Loader2 className="w-3 h-3 animate-spin" /> Ładowanie…</div>
      ) : (
        <div className="space-y-2 mb-4">
          {predictions.length === 0 ? (
            <div className="text-xs text-zinc-500 text-center py-4 border border-zinc-900 bg-black/20">
              Brak zakładów. Dodaj pierwszy poniżej.
            </div>
          ) : (
            predictions.map((p) => {
              const isOpen = p.status === "open";
              const isLocked = p.status === "locked";
              const isResolved = p.status === "resolved";
              const isCancelled = p.status === "cancelled";
              const isBusy = busy === p.id || pending;
              return (
                <div key={p.id} className={cn(
                  "border bg-black/30 p-3",
                  isOpen ? "border-green-900" :
                  isLocked ? "border-orange-900" :
                  isResolved ? "border-zinc-800" :
                  "border-zinc-900 opacity-60",
                )}>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        {isOpen && <span className="text-[9px] font-mono uppercase tracking-widest px-1.5 py-0.5 border border-green-700 bg-green-950/40 text-green-300">OPEN</span>}
                        {isLocked && <span className="text-[9px] font-mono uppercase tracking-widest px-1.5 py-0.5 border border-orange-700 bg-orange-950/40 text-orange-300">LOCKED</span>}
                        {isResolved && <span className="text-[9px] font-mono uppercase tracking-widest px-1.5 py-0.5 border border-zinc-700 bg-zinc-900/60 text-zinc-300">RESOLVED</span>}
                        {isCancelled && <span className="text-[9px] font-mono uppercase tracking-widest px-1.5 py-0.5 border border-zinc-800 text-zinc-500">CANCELLED</span>}
                        <span className="text-[10px] font-mono text-zinc-500">
                          {p.entriesCount} {p.entriesCount === 1 ? "wager" : "wagers"} · pula {fmt(p.totalPot)} GT
                        </span>
                        {p.closesAt && isOpen && (
                          <span className="text-[10px] font-mono text-orange-400">
                            Zamknięcie: {new Date(p.closesAt).toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "short" })}
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-white">{p.question}</div>
                    </div>
                  </div>

                  {/* Per-option breakdown + resolve buttons */}
                  <div className="space-y-1 mb-2">
                    {p.options.map((label, idx) => {
                      const b = p.breakdown.find((x) => x.index === idx);
                      const isWinner = p.resolvedOptionIndex === idx;
                      const pct = p.totalPot > 0 ? ((b?.total ?? 0) / p.totalPot) * 100 : 0;
                      return (
                        <div key={idx} className={cn(
                          "flex items-center gap-2 px-2 py-1.5 border text-xs",
                          isWinner ? "border-green-700 bg-green-950/30" : "border-zinc-800 bg-black/20",
                        )}>
                          <span className="font-mono text-[10px] text-zinc-500 shrink-0">#{idx + 1}</span>
                          <span className="text-white flex-1 truncate">{label}</span>
                          <span className="font-mono text-[10px] text-zinc-400 tabular-nums shrink-0">
                            {fmt(b?.total ?? 0)} GT · {b?.count ?? 0} · {pct.toFixed(0)}%
                          </span>
                          {(isOpen || isLocked) && (
                            <button
                              onClick={() => resolve(p, idx)}
                              disabled={isBusy}
                              className="text-[10px] font-mono uppercase tracking-widest text-green-300 hover:text-green-200 border border-green-900 hover:border-green-700 px-1.5 py-0.5 disabled:opacity-50 shrink-0"
                              title="Oznacz jako wygrywająca"
                            >
                              ✓ Win
                            </button>
                          )}
                          {isWinner && <span className="text-[10px] text-green-300 shrink-0">★ WINNER</span>}
                        </div>
                      );
                    })}
                  </div>

                  {/* Action buttons */}
                  <div className="flex items-center gap-1 flex-wrap">
                    {isOpen && (
                      <button
                        onClick={() => lock(p)}
                        disabled={isBusy}
                        className="text-[10px] font-mono uppercase tracking-widest text-orange-300 hover:text-orange-200 border border-orange-900 hover:border-orange-700 px-2 py-1 disabled:opacity-50"
                      >
                        Zablokuj
                      </button>
                    )}
                    {(isOpen || isLocked) && (
                      <button
                        onClick={() => cancel(p)}
                        disabled={isBusy}
                        className="text-[10px] font-mono uppercase tracking-widest text-zinc-400 hover:text-white border border-zinc-800 hover:border-zinc-600 px-2 py-1 disabled:opacity-50"
                      >
                        Anuluj (zwrot)
                      </button>
                    )}
                    {(isResolved || isCancelled) && (
                      <button
                        onClick={() => deletePrediction(p)}
                        disabled={isBusy}
                        className="text-[10px] font-mono uppercase tracking-widest text-red-400 hover:text-red-300 border border-red-900 hover:border-red-700 px-2 py-1 disabled:opacity-50 flex items-center gap-1"
                      >
                        <Trash2 className="w-3 h-3" />
                        Usuń
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Create form */}
      <div className="border border-zinc-800 bg-black/30 p-3">
        <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-2">
          Nowy zakład
        </div>
        <div className="space-y-2">
          <div>
            <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-0.5">Pytanie</label>
            <input
              value={newQuestion}
              onChange={(e) => setNewQuestion(e.target.value)}
              placeholder="np. Ile zgonów w tym streamie?"
              maxLength={500}
              className="w-full border border-zinc-700 bg-black/40 px-2 py-1.5 text-sm text-white outline-none focus:border-red-600"
            />
          </div>
          <div>
            <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-0.5">
              Opcje (2-4)
            </label>
            <div className="space-y-1">
              {newOptions.map((opt, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <span className="font-mono text-[10px] text-zinc-500 w-6">#{idx + 1}</span>
                  <input
                    value={opt}
                    onChange={(e) => {
                      const next = [...newOptions];
                      next[idx] = e.target.value;
                      setNewOptions(next);
                    }}
                    placeholder={`Opcja ${idx + 1}`}
                    maxLength={100}
                    className="flex-1 border border-zinc-700 bg-black/40 px-2 py-1.5 text-xs text-white outline-none focus:border-red-600"
                  />
                  {newOptions.length > 2 && (
                    <button
                      onClick={() => setNewOptions(newOptions.filter((_, i) => i !== idx))}
                      className="text-zinc-500 hover:text-red-400"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
              {newOptions.length < 4 && (
                <button
                  onClick={() => setNewOptions([...newOptions, ""])}
                  className="text-[10px] font-mono uppercase tracking-widest text-zinc-400 hover:text-white border border-dashed border-zinc-700 hover:border-zinc-500 px-2 py-1 w-full flex items-center justify-center gap-1"
                >
                  <Plus className="w-3 h-3" /> Dodaj opcję
                </button>
              )}
            </div>
          </div>
          <div className="flex items-end gap-2">
            <div>
              <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-0.5">
                Zamknij za (min, opcjonalne)
              </label>
              <input
                type="number"
                min={1}
                value={newClosesIn}
                onChange={(e) => setNewClosesIn(e.target.value)}
                placeholder="np. 30"
                className="w-24 border border-zinc-700 bg-black/40 px-2 py-1.5 text-xs text-white font-mono outline-none focus:border-red-600"
              />
            </div>
            <button
              onClick={createPrediction}
              disabled={busy === "create" || pending}
              className="ml-auto px-3 py-1.5 bg-red-700 hover:bg-red-600 text-white text-[10px] font-bold tracking-widest uppercase disabled:opacity-50 flex items-center gap-1.5"
            >
              {busy === "create" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Dice5 className="w-3 h-3" />}
              Utwórz zakład
            </button>
          </div>
        </div>
      </div>
    </SectionCard>
  );
}
