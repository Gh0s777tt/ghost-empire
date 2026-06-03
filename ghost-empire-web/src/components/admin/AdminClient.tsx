"use client";
// src/components/admin/AdminClient.tsx
import { useState, useTransition, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  ShieldCheck, Coins, Gift, Calendar, Package, Plus, X, Loader2, Check,
  Users, TrendingUp, Trash2, Copy, Dice5, Crown, Heart, UserCog, History, Award,
  ShoppingBag, Pencil, Eye, EyeOff, Ban, Bot, CalendarDays, Zap, Link as LinkIcon,
  LayoutDashboard, Bell, Tv, Menu, GitMerge, AlertTriangle, Radio, MonitorPlay,
  Target, RefreshCw, Ticket, MessageSquare, Clock, HelpCircle, UserPlus, Music, Play, SkipForward, Hourglass, BarChart3,
} from "lucide-react";
import { MOD_PERMISSIONS, PERMISSION_GROUPS } from "@/lib/permissions";
import {
  ALERT_TYPE_LIST,
  ALERT_ANIMATIONS,
  ALERT_POSITIONS,
  ANIMATION_LABELS,
  POSITION_LABELS,
  type AlertAnimation,
  type AlertPosition,
} from "@/lib/alert-types";
import { fmt, formatDate, cn } from "@/lib/utils";
import { AlertCard } from "@/components/AlertCard";
import { CodeCard } from "@/components/CodeCard";
import { OverlayPreview } from "@/components/admin/OverlayPreview";
import { GoalBar } from "@/components/GoalBar";
import { SubathonCard } from "@/components/SubathonCard";
import { ChatMessageRow, DEFAULT_CHAT_CFG, CHAT_FONTS, type ChatOverlayCfg, type ChatMsg } from "@/components/ChatMessageRow";

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
  imageUrl: string | null;
  stock: number;
  totalStock: number;
  hot: boolean;
  active: boolean;
  featured: boolean;
  requiresSubTier: string | null;
  requiresMinLevel: number | null;
  requiresMinMonths: number | null;
  requiresAchievement: string | null;
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
    sizeScale: number;
    textScale: number;
    textColor: string;
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
  targetName: string | null;
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
  stats, drops, events, pendingOrders,
}: {
  isAdmin: boolean;
  myPermissions: string[];
  stats: Stats;
  drops: Drop[];
  events: AdminEvent[];
  pendingOrders: PendingOrder[];
  // Everything else (shop/events-manager/schedule/bot/audit/streamlabs/twitch/alerts)
  // is lazy-loaded per-section via <LazySection> + /api/admin/section-data — keeps the
  // initial /admin server render to just the Dashboard's data.
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
    | "schedule" | "bot" | "donations" | "twitch" | "kick" | "youtube" | "chat" | "timers" | "faq" | "welcome" | "songs" | "alerts" | "goals" | "subathon" | "predictions" | "seasons" | "achievements" | "polls" | "analytics" | "audit";

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
    { id: "kick",      label: "Kick",        icon: Radio,           permission: () => isAdmin },
    { id: "youtube",   label: "YouTube",     icon: MonitorPlay,     permission: () => isAdmin },
    { id: "chat",      label: "Komendy czatu", icon: MessageSquare, permission: () => isAdmin },
    { id: "timers",    label: "Timery",        icon: Clock,         permission: () => isAdmin },
    { id: "faq",       label: "FAQ / auto",    icon: HelpCircle,    permission: () => isAdmin },
    { id: "welcome",   label: "Powitania",     icon: UserPlus,      permission: () => isAdmin },
    { id: "songs",     label: "Song requests", icon: Music,         permission: () => isAdmin },
    { id: "alerts",    label: "Stream Alerts", icon: Bell,          permission: () => isAdmin },
    { id: "goals",     label: "Stream Goals", icon: Target,         permission: () => isAdmin },
    { id: "subathon",  label: "Subathon",      icon: Hourglass,     permission: () => isAdmin },
    { id: "predictions", label: "Predictions", icon: Dice5,         permission: () => can("create_events") },
    { id: "seasons",   label: "Battle Pass", icon: Ticket,          permission: () => isAdmin },
    { id: "achievements", label: "Osiągnięcia", icon: Award,        permission: () => isAdmin },
    { id: "polls",     label: "Ankiety",     icon: BarChart3,       permission: () => isAdmin },
    { id: "analytics", label: "Analityka",    icon: TrendingUp,     permission: () => isAdmin },
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

  // Surface OAuth callback results (Twitch/Kick/YouTube streamer auth) as toasts.
  // The callbacks redirect back to /admin?<provider>_success=1 or ?<provider>_error=...
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const providers = [
      { ok: "kick_success", err: "kick_error", label: "Kick" },
      { ok: "twitch_success", err: "twitch_error", label: "Twitch" },
      { ok: "yt_success", err: "yt_error", label: "YouTube" },
    ];
    let matched = false;
    for (const p of providers) {
      if (params.has(p.ok)) {
        setToast({ kind: "ok", msg: `${p.label}: autoryzacja udana ✓` });
        matched = true;
      } else if (params.has(p.err)) {
        setToast({ kind: "err", msg: `${p.label}: błąd autoryzacji — ${params.get(p.err)}` });
        matched = true;
      }
    }
    if (matched) {
      setTimeout(() => setToast(null), 7000);
      const url = new URL(window.location.href);
      ["kick_success","kick_error","twitch_success","twitch_error","yt_success","yt_error"]
        .forEach((k) => url.searchParams.delete(k));
      window.history.replaceState(null, "", url.toString());
    }
     
  }, []);

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

        <div key={activeSection} className="flex-1 min-w-0 space-y-6 animate-fade-in-up">
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
              {isAdmin && <DatabaseResetCard {...sharedProps} />}
            </div>
          )}

          {activeSection === "merge" && isAdmin && (
            <MergeUsersSection {...sharedProps} />
          )}

          {activeSection === "achievements" && isAdmin && (
            <AchievementsManager {...sharedProps} />
          )}

          {activeSection === "polls" && isAdmin && (
            <PollsManager {...sharedProps} />
          )}

          {activeSection === "events" && (
            <div className="space-y-6">
              {can("create_events") && <HolidayEventsCard {...sharedProps} />}
              {can("create_events") && <CreateEventCard {...sharedProps} />}
              {(can("edit_events") || can("draw_events")) && <ActiveEventsList events={events} {...sharedProps} />}
              {can("edit_events") && (
                <LazySection<{ allEvents: EventRow[] }> s="events">
                  {(d) => <EventManager events={d.allEvents} {...sharedProps} />}
                </LazySection>
              )}
            </div>
          )}

          {activeSection === "shop" && (
            <div className="space-y-6">
              {can("deliver_orders") && <PendingOrdersList orders={pendingOrders} {...sharedProps} />}
              {can("manage_shop") && (
                <LazySection<{ allShopItems: ShopItemRow[]; achievements: { code: string; name: string }[] }> s="shop">
                  {(d) => <ShopManager items={d.allShopItems} achievements={d.achievements} {...sharedProps} />}
                </LazySection>
              )}
            </div>
          )}

          {activeSection === "drops" && (
            <div className="space-y-6">
              {can("create_drops") && <CreateDropCard {...sharedProps} />}
              {can("create_drops") && <ActiveDropsList drops={drops} {...sharedProps} />}
              {isAdmin && (
                <LazySection<{ codes: CodeRow[]; codeConfig: CodeConfig; overlayToken: string | null }> s="codes">
                  {(d) => <CodeDropsCard codes={d.codes} config={d.codeConfig} overlayToken={d.overlayToken} {...sharedProps} />}
                </LazySection>
              )}
            </div>
          )}

          {activeSection === "schedule" && can("manage_shop") && (
            <LazySection<{ scheduleSlots: ScheduleSlot[] }> s="schedule">
              {(d) => <ScheduleManager slots={d.scheduleSlots} {...sharedProps} />}
            </LazySection>
          )}

          {activeSection === "bot" && can("manage_shop") && (
            <LazySection<{ botConfig: BotConfigData }> s="bot">
              {(d) => <BotConfigCard config={d.botConfig} {...sharedProps} />}
            </LazySection>
          )}

          {activeSection === "donations" && isAdmin && (
            <LazySection<{ streamlabsConnection: StreamlabsConnectionData; unmatchedDonations: UnmatchedDonation[] }> s="streamlabs">
              {(d) => (
                <StreamlabsManager
                  connection={d.streamlabsConnection}
                  unmatchedDonations={d.unmatchedDonations}
                  {...sharedProps}
                />
              )}
            </LazySection>
          )}

          {activeSection === "twitch" && isAdmin && (
            <LazySection<{ twitchEventSub: TwitchEventSubData }> s="twitch">
              {(d) => <TwitchEventSubManager data={d.twitchEventSub} {...sharedProps} />}
            </LazySection>
          )}

          {activeSection === "kick" && isAdmin && (
            <KickEventsManager {...sharedProps} />
          )}

          {activeSection === "youtube" && isAdmin && (
            <YouTubeLiveManager {...sharedProps} />
          )}

          {activeSection === "chat" && isAdmin && (
            <div className="space-y-6">
              <ChatCommandsManager {...sharedProps} />
              <ChatOverlayCard {...sharedProps} />
            </div>
          )}

          {activeSection === "timers" && isAdmin && (
            <ChatTimersManager {...sharedProps} />
          )}

          {activeSection === "faq" && isAdmin && (
            <FaqManager {...sharedProps} />
          )}

          {activeSection === "welcome" && isAdmin && (
            <WelcomeManager {...sharedProps} />
          )}

          {activeSection === "songs" && isAdmin && (
            <SongQueueManager {...sharedProps} />
          )}

          {activeSection === "alerts" && isAdmin && (
            <div className="space-y-6">
              <LazySection<{ streamAlerts: StreamAlertsData }> s="alerts">
                {(d) => <StreamAlertsManager data={d.streamAlerts} {...sharedProps} />}
              </LazySection>
              <CustomAlertsCard {...sharedProps} />
            </div>
          )}

          {activeSection === "goals" && isAdmin && (
            <StreamGoalsManager {...sharedProps} />
          )}

          {activeSection === "subathon" && isAdmin && (
            <SubathonManager {...sharedProps} />
          )}

          {activeSection === "predictions" && can("create_events") && (
            <PredictionsManager {...sharedProps} />
          )}

          {activeSection === "seasons" && isAdmin && (
            <SeasonsManager {...sharedProps} />
          )}

          {activeSection === "analytics" && isAdmin && (
            <ChatHeatmap />
          )}

          {activeSection === "audit" && can("view_audit") && (
            <LazySection<{ auditLog: AuditEntry[] }> s="audit">
              {(d) => <AuditLogSection auditLog={d.auditLog} />}
            </LazySection>
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

// ============== LAZY SECTION (defers per-section data fetch) ==============

/**
 * Fetches /api/admin/section-data?s={s} on mount and renders children with the
 * result. Keeps the manager components untouched — only their data loading is
 * deferred, so opening /admin no longer fetches every section's data up-front.
 */
function LazySection<T>({ s, children }: { s: string; children: (data: T) => React.ReactNode }) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(null);
    fetch(`/api/admin/section-data?s=${encodeURIComponent(s)}`)
      .then(async (r) => {
        if (!r.ok) {
          const e = await r.json().catch(() => ({}));
          throw new Error(e.error ?? `Błąd ${r.status}`);
        }
        return r.json();
      })
      .then((d) => { if (!cancelled) setData(d as T); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "Błąd ładowania"); });
    return () => { cancelled = true; };
  }, [s]);

  if (error) {
    return (
      <div className="border border-red-800 bg-red-950/30 p-4 text-sm text-red-200">
        Nie udało się załadować sekcji: {error}
      </div>
    );
  }
  if (data === null) {
    return (
      <div className="border border-zinc-800 bg-black/30 p-8 flex items-center justify-center gap-2 text-zinc-500 text-sm">
        <Loader2 className="w-4 h-4 animate-spin" /> Ładowanie sekcji…
      </div>
    );
  }
  return <>{children(data)}</>;
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
          "border border-zinc-800 bg-zinc-950/70 backdrop-blur-xs p-2",
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
        "border bg-zinc-950/70 backdrop-blur-xs p-3",
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
      className="border border-zinc-800 bg-zinc-950/80 backdrop-blur-xs p-5"
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
          label="User (username, Discord ID lub ID konta)"
          value={target}
          onChange={setTarget}
          placeholder="gh0s77tt / 1500923809522258000 / cmpq74…"
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

// ============== HOLIDAY / SEASONAL EVENT TEMPLATES ==============

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

function HolidayEventsCard({
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
              <span className="text-2xl shrink-0">{t.shopItem?.imageEmoji ?? "🎁"}</span>
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
              <div className="flex gap-1 shrink-0">
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
  items, achievements, onToast, onSuccess, pending,
}: {
  items: ShopItemRow[];
  achievements: { code: string; name: string }[];
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
            <span className="text-xl shrink-0">{item.imageEmoji ?? "🎁"}</span>
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
          achievements={achievements}
          onClose={() => { setEditing(null); setCreating(false); }}
          onSaved={() => { setEditing(null); setCreating(false); onSuccess(); }}
          onToast={onToast}
        />
      )}
    </SectionCard>
  );
}

function ShopItemEditor({
  item, isNew, achievements, onClose, onSaved, onToast,
}: {
  item: ShopItemRow | null;
  isNew: boolean;
  achievements: { code: string; name: string }[];
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
  const [requiresMinMonths, setRequiresMinMonths] = useState(item?.requiresMinMonths?.toString() ?? "");
  const [requiresAchievement, setRequiresAchievement] = useState(item?.requiresAchievement ?? "");
  const [imageUrl, setImageUrl] = useState(item?.imageUrl ?? "");
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      const payload: Record<string, unknown> = {
        name, description, category, price: parseInt(price),
        imageEmoji: imageEmoji || "🎁",
        imageUrl: imageUrl.trim() || null,
        stock: parseInt(stock),
        totalStock: parseInt(totalStock || stock),
        hot, featured,
        requiresSubTier: requiresSubTier || null,
        requiresMinLevel: requiresMinLevel ? parseInt(requiresMinLevel) : null,
        requiresMinMonths: requiresMinMonths ? parseInt(requiresMinMonths) : null,
        requiresAchievement: requiresAchievement || null,
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
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4"
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

          <FieldInput label="URL grafiki / screena (opcjonalny, http(s)://)" value={imageUrl} onChange={setImageUrl} placeholder="https://..." />
          {imageUrl.trim() && (
            <img src={imageUrl} alt="" className="w-full max-h-40 object-contain border border-zinc-800 bg-black" />
          )}

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

          <div className="grid grid-cols-2 gap-2">
            <FieldInput label="Wymagany min level (opcjonalny)" value={requiresMinLevel} onChange={setRequiresMinLevel} type="number" />
            <FieldInput label="Wymagane mc subskrypcji (opcjonalny)" value={requiresMinMonths} onChange={setRequiresMinMonths} type="number" />
          </div>

          <div>
            <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-1">Odblokowane przez osiągnięcie (opcjonalne)</label>
            <select
              value={requiresAchievement}
              onChange={(e) => setRequiresAchievement(e.target.value)}
              className="w-full bg-black border border-zinc-800 px-3 py-2 text-sm text-white focus:border-red-500 outline-hidden"
            >
              <option value="">— brak (dostępne dla wszystkich) —</option>
              {achievements.map((a) => (
                <option key={a.code} value={a.code}>{a.name}</option>
              ))}
            </select>
          </div>

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
            <span className="text-[10px] font-mono uppercase tracking-widest px-2 py-1 border border-zinc-700 text-zinc-300 shrink-0">
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
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4" onClick={() => !busy && onClose()}>
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
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- /api/auth/streamlabs is an API route doing a server-side OAuth redirect, not a Next page; <a> is correct here */}
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
                      className="flex-1 border border-zinc-800 bg-black/30 px-2 py-1 text-xs text-white font-mono outline-hidden focus:border-red-600 placeholder:text-zinc-700"
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
  reset_database:      { label: "Reset bazy",       emoji: "💥", color: "#ef4444" },
  manage_codes:        { label: "Kody (drop)",      emoji: "🔑", color: "#10b981" },
  manage_achievements: { label: "Osiągnięcia",      emoji: "🏆", color: "#fbbf24" },
  manage_polls:        { label: "Ankieta",          emoji: "📊", color: "#3b82f6" },
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
                // Drop keys already shown as the target name (avoids duplication).
                .filter(([k, v]) => v !== null && v !== undefined && v !== "" && k !== "targetUsername" && k !== "username")
                .map(([k, v]) => `${k}=${typeof v === "object" ? JSON.stringify(v) : v}`)
                .join(" · ");
            } catch {
              detailsText = entry.details;
            }
          }
          return (
            <div key={entry.id} className="flex items-start gap-3 border-l-2 border-zinc-800 pl-3 py-1.5">
              <span className="text-base shrink-0">{meta.emoji}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-x-2 gap-y-0.5 flex-wrap text-sm">
                  <span className="font-semibold text-white">
                    {entry.adminName ?? "konto usunięte"}
                  </span>
                  <span className="font-bold" style={{ color: meta.color }}>
                    {meta.label}
                  </span>
                  {entry.targetName && (
                    <>
                      <span className="text-zinc-600">→</span>
                      <span className="font-semibold text-white">{entry.targetName}</span>
                    </>
                  )}
                  <span className="text-[10px] font-mono text-zinc-700 ml-auto whitespace-nowrap">
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
                      title={p.desc}
                      className={cn(
                        "flex items-start gap-2 px-2 py-1.5 border cursor-pointer transition-all",
                        isSet
                          ? "border-blue-700 bg-blue-950/30 text-blue-200"
                          : "border-zinc-800 bg-zinc-950 text-zinc-400 hover:border-zinc-700",
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={isSet}
                        onChange={() => onToggle(p.id)}
                        className="accent-blue-500 mt-0.5 shrink-0"
                      />
                      <span className="min-w-0">
                        <span className="text-xs block font-medium">{p.label}</span>
                        <span className="text-[10px] text-zinc-500 leading-snug block">{p.desc}</span>
                      </span>
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
          label="User (username, Discord ID lub ID konta)"
          value={target}
          onChange={setTarget}
          placeholder="gh0s77tt / 1500923809522258000 / cmpq74…"
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
        <FieldInput label="User" value={target} onChange={setTarget} placeholder="username / Discord ID / ID konta" />

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

// ============== POLLS (admin: create / close / delete) ==============

type PollRow = { id: string; question: string; options: string[]; status: string; createdAt: string; closesAt: string | null; totalVotes: number; counts: number[] };

function PollsManager({
  onToast,
}: {
  onToast: (k: "ok" | "err", m: string) => void;
  onSuccess: () => void;
  pending: boolean;
}) {
  const [list, setList] = useState<PollRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [optionsText, setOptionsText] = useState("");

  async function load() {
    try {
      const r = await fetch("/api/admin/polls");
      if (r.ok) { const d = await r.json(); setList(d.polls ?? []); }
    } catch { /* keep */ } finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  async function call(payload: Record<string, unknown>, okMsg?: string) {
    setBusy(typeof payload.id === "string" ? payload.id : "create");
    try {
      const res = await fetch("/api/admin/polls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) { onToast("err", data.error ?? "Błąd"); return false; }
      if (okMsg) onToast("ok", okMsg);
      return true;
    } catch { onToast("err", "Błąd sieci"); return false; }
    finally { setBusy(null); }
  }

  async function create() {
    const options = optionsText.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    if (!question.trim()) { onToast("err", "Pytanie wymagane"); return; }
    if (options.length < 2) { onToast("err", "Podaj min. 2 opcje (po jednej w linii)"); return; }
    if (await call({ action: "create", question: question.trim(), options }, "Ankieta utworzona")) {
      setQuestion(""); setOptionsText(""); await load();
    }
  }

  return (
    <SectionCard title="Ankiety / głosowania" icon={BarChart3}>
      <div className="space-y-4">
        <p className="text-xs text-zinc-500 leading-relaxed">
          Proste ankiety społeczności (bez tokenów). Widoczne na <code className="text-zinc-400">/polls</code>; zalogowani głosują,
          mogą zmienić głos póki ankieta otwarta. Zamknięta = tylko wyniki.
        </p>

        {/* Create */}
        <div className="border border-zinc-800 bg-black/30 p-3 space-y-2">
          <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">Nowa ankieta</div>
          <FieldInput label="Pytanie" value={question} onChange={setQuestion} placeholder="np. W co gramy w piątek?" />
          <FieldTextarea label="Opcje (po jednej w linii, 2–10)" value={optionsText} onChange={setOptionsText} />
          <button onClick={create} disabled={busy === "create" || !question.trim()}
            className="w-full px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-xs font-bold tracking-widest uppercase transition-all disabled:opacity-50 flex items-center justify-center gap-2">
            {busy === "create" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            Utwórz ankietę
          </button>
        </div>

        {/* List */}
        {loading ? (
          <div className="text-xs text-zinc-500 flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin" /> Ładowanie…</div>
        ) : (
          <div className="space-y-2 max-h-[460px] overflow-y-auto">
            {list.length === 0 && <p className="text-zinc-600 text-sm">Brak ankiet.</p>}
            {list.map((p) => (
              <div key={p.id} className="border border-zinc-800 bg-zinc-950 p-3">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-white">{p.question}</div>
                    <div className="text-[10px] font-mono text-zinc-500">{p.totalVotes} głosów · {p.status === "open" ? "otwarta" : "zamknięta"}</div>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    {p.status === "open" ? (
                      <button onClick={async () => { if (await call({ action: "close", id: p.id }, "Zamknięto")) await load(); }} disabled={busy === p.id}
                        className="text-[9px] font-mono uppercase tracking-widest px-2 py-1 border border-zinc-700 text-zinc-300 hover:border-zinc-500 disabled:opacity-50">Zamknij</button>
                    ) : (
                      <button onClick={async () => { if (await call({ action: "reopen", id: p.id }, "Otwarto")) await load(); }} disabled={busy === p.id}
                        className="text-[9px] font-mono uppercase tracking-widest px-2 py-1 border border-green-800 text-green-300 hover:border-green-600 disabled:opacity-50">Otwórz</button>
                    )}
                    <button onClick={async () => { if (window.confirm("Usunąć ankietę?") && await call({ action: "delete", id: p.id }, "Usunięto")) await load(); }} disabled={busy === p.id}
                      className="text-zinc-500 hover:text-red-400 disabled:opacity-50"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
                <div className="space-y-1">
                  {p.options.map((opt, i) => {
                    const count = p.counts[i] ?? 0;
                    const pct = p.totalVotes > 0 ? (count / p.totalVotes) * 100 : 0;
                    return (
                      <div key={i} className="relative border border-zinc-800 overflow-hidden">
                        <div className="absolute inset-y-0 left-0 bg-blue-900/30" style={{ width: `${pct}%` }} />
                        <div className="relative flex items-center justify-between px-2 py-1 text-[11px]">
                          <span className="text-zinc-300">{opt}</span>
                          <span className="font-mono text-zinc-500 tabular-nums">{pct.toFixed(0)}% · {count}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </SectionCard>
  );
}

// ============== ACHIEVEMENTS (admin CRUD + manual award) ==============

type AchRow = {
  id: string; code: string; name: string; description: string; icon: string;
  rarity: string; hidden: boolean; triggerType: string | null; triggerValue: number | null;
  xpReward: number; tokenReward: number; rewardNote: string | null; earnedCount: number;
};

const RARITY_COLOR: Record<string, string> = {
  common: "#a1a1aa", rare: "#3b82f6", epic: "#a855f7", legendary: "#fbbf24",
};

function AchievementsManager({
  onToast,
}: {
  onToast: (k: "ok" | "err", m: string) => void;
  onSuccess: () => void;
  pending: boolean;
}) {
  const [list, setList] = useState<AchRow[]>([]);
  const [rarities, setRarities] = useState<string[]>([]);
  const [triggerTypes, setTriggerTypes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<AchRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [awardTarget, setAwardTarget] = useState("");
  const [awardCode, setAwardCode] = useState("");

  async function load() {
    try {
      const r = await fetch("/api/admin/achievements");
      if (r.ok) {
        const d = await r.json();
        setList(d.achievements ?? []);
        setRarities(d.rarities ?? []);
        setTriggerTypes(d.triggerTypes ?? []);
      }
    } catch { /* keep current */ } finally {
      setLoading(false);
    }
  }
  useEffect(() => { void load(); }, []);

  async function call(payload: Record<string, unknown>, okMsg?: string) {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/achievements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) { onToast("err", data.error ?? "Błąd"); return false; }
      if (okMsg) onToast("ok", okMsg);
      return true;
    } catch { onToast("err", "Błąd sieci"); return false; }
    finally { setBusy(false); }
  }

  async function award() {
    if (!awardTarget.trim() || !awardCode) return;
    if (await call({ action: "award", target: awardTarget.trim(), code: awardCode }, "Osiągnięcie przyznane")) {
      setAwardTarget("");
      await load();
    }
  }

  return (
    <SectionCard title="Osiągnięcia (własne + przyznawanie)" icon={Award}>
      <div className="space-y-4">
        <p className="text-xs text-zinc-500 leading-relaxed">
          Twórz własne osiągnięcia. Typy auto (level / suby / donacje itd.) przyznają się same po przekroczeniu progu;
          typ <strong className="text-zinc-300">manual</strong> przyznajesz ręcznie poniżej. Nagroda to XP / tokeny i/lub
          <strong className="text-zinc-300"> nagroda rzeczowa</strong> (kod/przedmiot) pokazywana graczowi w powiadomieniu.
        </p>

        {/* Manual award */}
        <div className="border border-zinc-800 bg-black/30 p-3">
          <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-2">Przyznaj osiągnięcie userowi</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-end">
            <FieldInput label="User (username / Discord ID / ID konta)" value={awardTarget} onChange={setAwardTarget} placeholder="gh0s77tt" />
            <div>
              <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-1">Osiągnięcie</label>
              <select value={awardCode} onChange={(e) => setAwardCode(e.target.value)} className="w-full bg-black border border-zinc-800 px-3 py-2 text-sm text-white outline-hidden focus:border-red-500">
                <option value="">— wybierz —</option>
                {list.map((a) => <option key={a.id} value={a.code}>{a.icon} {a.name}</option>)}
              </select>
            </div>
            <button onClick={award} disabled={busy || !awardTarget.trim() || !awardCode}
              className="px-4 py-2 bg-yellow-700 hover:bg-yellow-600 text-white text-xs font-bold tracking-widest uppercase transition-all disabled:opacity-50 flex items-center justify-center gap-2">
              <Award className="w-3.5 h-3.5" /> Przyznaj
            </button>
          </div>
        </div>

        <button onClick={() => { setCreating(true); setEditing(null); }}
          className="w-full px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-bold tracking-widest uppercase transition-all flex items-center justify-center gap-2">
          <Plus className="w-3.5 h-3.5" /> Nowe osiągnięcie
        </button>

        {/* List */}
        {loading ? (
          <div className="text-xs text-zinc-500 flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin" /> Ładowanie…</div>
        ) : (
          <div className="space-y-1 max-h-[420px] overflow-y-auto">
            {list.length === 0 && <p className="text-zinc-600 text-sm">Brak osiągnięć — utwórz pierwsze powyżej.</p>}
            {list.map((a) => (
              <div key={a.id} className="flex items-center gap-3 border border-zinc-800 bg-zinc-950 px-3 py-2">
                <span className="text-xl shrink-0">{a.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold text-white truncate">{a.name}</span>
                    <span className="text-[9px] font-mono uppercase px-1.5 py-0.5 border" style={{ color: RARITY_COLOR[a.rarity] ?? "#a1a1aa", borderColor: (RARITY_COLOR[a.rarity] ?? "#a1a1aa") + "55" }}>{a.rarity}</span>
                    {a.hidden && <span className="text-[9px] font-mono uppercase text-zinc-600">ukryte</span>}
                    {a.rewardNote && <span className="text-[9px] text-amber-300" title={a.rewardNote}>🎁 nagroda</span>}
                  </div>
                  <div className="text-[10px] font-mono text-zinc-500 truncate">
                    {a.code} · {a.triggerType}{a.triggerValue != null ? ` ≥ ${a.triggerValue}` : ""} · {a.tokenReward} GT · zdobyte ×{a.earnedCount}
                  </div>
                </div>
                <button onClick={() => { setEditing(a); setCreating(false); }} disabled={busy} title="Edytuj" className="text-zinc-500 hover:text-white"><Pencil className="w-3.5 h-3.5" /></button>
                <button
                  onClick={async () => { if (window.confirm(`Usunąć „${a.name}"? Zniknie też u wszystkich, którzy je zdobyli.`) && await call({ action: "delete", id: a.id }, "Usunięto")) await load(); }}
                  disabled={busy} title="Usuń" className="text-zinc-500 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            ))}
          </div>
        )}
      </div>

      {(creating || editing) && (
        <AchievementEditor
          achievement={editing}
          isNew={creating}
          rarities={rarities}
          triggerTypes={triggerTypes}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSaved={() => { setCreating(false); setEditing(null); void load(); }}
          onToast={onToast}
        />
      )}
    </SectionCard>
  );
}

function AchievementEditor({
  achievement, isNew, rarities, triggerTypes, onClose, onSaved, onToast,
}: {
  achievement: AchRow | null;
  isNew: boolean;
  rarities: string[];
  triggerTypes: string[];
  onClose: () => void;
  onSaved: () => void;
  onToast: (k: "ok" | "err", m: string) => void;
}) {
  const [code, setCode] = useState(achievement?.code ?? "");
  const [name, setName] = useState(achievement?.name ?? "");
  const [description, setDescription] = useState(achievement?.description ?? "");
  const [icon, setIcon] = useState(achievement?.icon ?? "🏆");
  const [rarity, setRarity] = useState(achievement?.rarity ?? "common");
  const [triggerType, setTriggerType] = useState(achievement?.triggerType ?? "manual");
  const [triggerValue, setTriggerValue] = useState(achievement?.triggerValue?.toString() ?? "");
  const [xpReward, setXpReward] = useState(achievement?.xpReward?.toString() ?? "0");
  const [tokenReward, setTokenReward] = useState(achievement?.tokenReward?.toString() ?? "0");
  const [rewardNote, setRewardNote] = useState(achievement?.rewardNote ?? "");
  const [hidden, setHidden] = useState(achievement?.hidden ?? false);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      const fields = { name, description, icon, rarity, triggerType, triggerValue, xpReward, tokenReward, rewardNote, hidden };
      const payload: Record<string, unknown> = isNew
        ? { action: "create", code, ...fields }
        : { action: "update", id: achievement!.id, ...fields };
      const res = await fetch("/api/admin/achievements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) { onToast("err", data.error ?? "Błąd"); }
      else { onToast("ok", isNew ? "Osiągnięcie utworzone" : "Zapisano"); onSaved(); }
    } finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4" onClick={() => !busy && onClose()}>
      <div className="bg-zinc-950 border-2 border-zinc-800 max-w-2xl w-full p-5 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display text-xl text-white tracking-wider">{isNew ? "NOWE OSIĄGNIĘCIE" : "EDYCJA OSIĄGNIĘCIA"}</h3>
          <button onClick={onClose} disabled={busy} className="text-zinc-500 hover:text-red-400"><X className="w-5 h-5" /></button>
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {isNew ? (
              <FieldInput label="Kod (unikalny)" value={code} onChange={setCode} placeholder="np. clip_master" />
            ) : (
              <div>
                <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-1">Kod</label>
                <div className="bg-black/50 border border-zinc-900 px-3 py-2 text-sm text-zinc-500 font-mono truncate">{code}</div>
              </div>
            )}
            <FieldInput label="Emoji" value={icon} onChange={setIcon} placeholder="🏆" />
            <div className="col-span-2">
              <FieldInput label="Nazwa" value={name} onChange={setName} placeholder="np. Mistrz Klipów" />
            </div>
          </div>

          <FieldTextarea label="Opis" value={description} onChange={setDescription} />

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-1">Rzadkość</label>
              <select value={rarity} onChange={(e) => setRarity(e.target.value)} className="w-full bg-black border border-zinc-800 px-3 py-2 text-sm text-white outline-hidden focus:border-red-500">
                {rarities.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-1">Wyzwalacz (trigger)</label>
              <select value={triggerType} onChange={(e) => setTriggerType(e.target.value)} className="w-full bg-black border border-zinc-800 px-3 py-2 text-sm text-white outline-hidden focus:border-red-500">
                {triggerTypes.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <FieldInput label="Próg (triggerValue)" value={triggerValue} onChange={setTriggerValue} type="number" placeholder="np. 10" />
            <FieldInput label="Nagroda XP" value={xpReward} onChange={setXpReward} type="number" />
            <FieldInput label="Nagroda GT" value={tokenReward} onChange={setTokenReward} type="number" />
          </div>

          <FieldInput label="Nagroda rzeczowa (kod/przedmiot — pokazywana graczowi, opcjonalna)" value={rewardNote} onChange={setRewardNote} placeholder="np. Klucz Steam: XXXX-YYYY / rola VIP na Discordzie" />

          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.target.checked)} className="accent-zinc-500" />
            <span className="text-[10px] font-bold tracking-widest uppercase text-zinc-300">Ukryte (sekretne)</span>
          </label>

          <button onClick={save} disabled={busy || !name.trim() || (isNew && !code.trim())}
            className="w-full px-4 py-2.5 bg-red-600 hover:bg-red-500 text-white text-xs font-bold tracking-widest uppercase transition-all disabled:opacity-50 flex items-center justify-center gap-2">
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            {isNew ? "Utwórz" : "Zapisz"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============== CUSTOM ALERTS (admin-defined, manually fired) ==============

type CustomAlertRow = { id: string; label: string; title: string; message: string; icon: string | null; accent: string | null; amount: number | null; amountLabel: string | null };

function CustomAlertsCard({
  onToast,
}: {
  onToast: (k: "ok" | "err", m: string) => void;
  onSuccess: () => void;
  pending: boolean;
}) {
  const [list, setList] = useState<CustomAlertRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<CustomAlertRow | null>(null);
  const [creating, setCreating] = useState(false);

  const [label, setLabel] = useState("");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [icon, setIcon] = useState("🔔");
  const [accent, setAccent] = useState("#E50914");
  const [useAccent, setUseAccent] = useState(false);
  const [amount, setAmount] = useState("");
  const [amountLabel, setAmountLabel] = useState("");

  async function load() {
    try {
      const r = await fetch("/api/admin/custom-alerts");
      if (r.ok) { const d = await r.json(); setList(d.customAlerts ?? []); }
    } catch { /* keep */ } finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  function openCreate() {
    setEditing(null); setCreating(true);
    setLabel(""); setTitle(""); setMessage(""); setIcon("🔔"); setAccent("#E50914"); setUseAccent(false); setAmount(""); setAmountLabel("");
  }
  function openEdit(a: CustomAlertRow) {
    setCreating(false); setEditing(a);
    setLabel(a.label); setTitle(a.title); setMessage(a.message); setIcon(a.icon ?? "🔔");
    setAccent(a.accent ?? "#E50914"); setUseAccent(!!a.accent); setAmount(a.amount?.toString() ?? ""); setAmountLabel(a.amountLabel ?? "");
  }

  async function call(payload: Record<string, unknown>, okMsg?: string) {
    setBusy(typeof payload.id === "string" ? payload.id : "new");
    try {
      const res = await fetch("/api/admin/custom-alerts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const d = await res.json();
      if (!res.ok) { onToast("err", d.error ?? "Błąd"); return false; }
      if (okMsg) onToast("ok", okMsg);
      return true;
    } catch { onToast("err", "Błąd sieci"); return false; } finally { setBusy(null); }
  }

  async function save() {
    const ok = await call(
      { action: editing ? "update" : "create", id: editing?.id, label, title, message, icon, accent: useAccent ? accent : null, amount, amountLabel },
      editing ? "Alert zapisany" : "Alert utworzony",
    );
    if (ok) { setEditing(null); setCreating(false); await load(); }
  }

  const previewAccent = useAccent ? accent : "#E50914";

  return (
    <SectionCard title="Własne alerty" icon={Bell}>
      <div className="space-y-4">
        <p className="text-zinc-500 text-xs leading-relaxed">
          Twórz własne alerty (nazwa / tytuł / treść / ikona / opcjonalny kolor i liczba) i <strong className="text-zinc-300">wyzwalaj je ręcznie</strong> na overlayu OBS — np. raid, ogłoszenie, milestone.
        </p>

        {!(creating || editing) && (
          <button onClick={openCreate} className="w-full px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-bold tracking-widest uppercase transition-all flex items-center justify-center gap-2">
            <Plus className="w-3.5 h-3.5" /> Nowy alert
          </button>
        )}

        {(creating || editing) && (
          <div className="border border-zinc-800 bg-black/30 p-3 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <FieldInput label="Nazwa (w panelu)" value={label} onChange={setLabel} placeholder="np. Raid alert" />
              <FieldInput label="Ikona (emoji)" value={icon} onChange={setIcon} placeholder="🔔" />
            </div>
            <FieldInput label="Tytuł (na overlayu)" value={title} onChange={setTitle} placeholder="🚨 RAID!" />
            <FieldTextarea label="Treść" value={message} onChange={setMessage} />
            <div className="grid grid-cols-2 gap-2">
              <FieldInput label="Liczba (opcjonalna)" value={amount} onChange={setAmount} type="number" />
              <FieldInput label="Etykieta liczby (np. GT)" value={amountLabel} onChange={setAmountLabel} />
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={useAccent} onChange={(e) => setUseAccent(e.target.checked)} className="accent-red-500" />
              <span className="text-[10px] font-bold tracking-widest uppercase text-zinc-300">Własny kolor akcentu</span>
              {useAccent && <input type="color" value={accent} onChange={(e) => setAccent(e.target.value)} className="h-7 w-12 bg-black border border-zinc-800 cursor-pointer" />}
            </label>

            <div>
              <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-1">Podgląd</label>
              <div className="border border-zinc-800 rounded-sm p-4" style={{ background: "repeating-conic-gradient(#18181b 0% 25%, #0a0a0a 0% 50%) 50% / 24px 24px" }}>
                <AlertCard
                  alert={{ title: title || "Tytuł alertu", message: message || "Treść alertu", icon, actorName: null, actorImage: null, amount: amount ? parseInt(amount) : null, amountLabel: amountLabel || null }}
                  accent={previewAccent}
                />
              </div>
            </div>

            <div className="flex gap-2">
              <button onClick={() => { setEditing(null); setCreating(false); }} className="flex-1 px-4 py-2 border border-zinc-800 hover:border-zinc-700 text-zinc-400 text-xs font-bold tracking-widest uppercase transition-all">Anuluj</button>
              <button onClick={save} disabled={busy !== null || !label.trim() || !title.trim()} className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-xs font-bold tracking-widest uppercase transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                {busy === "new" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} {editing ? "Zapisz" : "Utwórz"}
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="text-xs text-zinc-500 flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin" /> Ładowanie…</div>
        ) : (
          <div className="space-y-1">
            {list.length === 0 && <p className="text-zinc-600 text-sm">Brak własnych alertów — utwórz pierwszy powyżej.</p>}
            {list.map((a) => (
              <div key={a.id} className="flex items-center gap-2 border border-zinc-800 bg-zinc-950 px-2 py-1.5">
                <span className="text-lg shrink-0">{a.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-white truncate">{a.label}</div>
                  <div className="text-[10px] text-zinc-500 truncate">{a.title}</div>
                </div>
                {a.accent && <span className="w-3 h-3 rounded-full shrink-0" style={{ background: a.accent }} title={a.accent} />}
                <button
                  onClick={() => call({ action: "fire", id: a.id }, `Wyzwolono: ${a.label}`)}
                  disabled={busy !== null}
                  title="Wyzwól na overlayu"
                  className="px-2.5 py-1 bg-red-600 hover:bg-red-500 text-white text-[10px] font-bold tracking-widest uppercase disabled:opacity-50"
                >
                  Wyzwól
                </button>
                <button onClick={() => openEdit(a)} disabled={busy !== null} title="Edytuj" className="text-zinc-500 hover:text-white disabled:opacity-50"><Pencil className="w-3.5 h-3.5" /></button>
                <button
                  onClick={async () => { if (window.confirm(`Usunąć alert „${a.label}"?`) && await call({ action: "delete", id: a.id }, "Usunięto")) await load(); }}
                  disabled={busy !== null}
                  title="Usuń"
                  className="text-zinc-500 hover:text-red-400 disabled:opacity-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </SectionCard>
  );
}

// ============== CHAT OVERLAY APPEARANCE (admin only) ==============

type AlertTypeRow = {
  type: string;
  label: string;
  animation: AlertAnimation;
  position: AlertPosition;
  soundUrl: string | null;
  minAmount: number | null;
  configured: boolean;
};

function AlertTypeList({
  enabledTypes,
  onToggle,
  onToast,
}: {
  enabledTypes: string[];
  onToggle: (t: string) => void;
  onToast: (k: "ok" | "err", m: string) => void;
}) {
  const [rows, setRows] = useState<AlertTypeRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [savingType, setSavingType] = useState<string | null>(null);
  const [openType, setOpenType] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/alert-types")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled) { if (d?.types) setRows(d.types); setLoaded(true); } })
      .catch(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, []);

  function patch(type: string, k: keyof AlertTypeRow, v: unknown) {
    setRows((rs) => rs.map((r) => (r.type === type ? { ...r, [k]: v } : r)));
  }

  async function save(row: AlertTypeRow) {
    setSavingType(row.type);
    try {
      const res = await fetch("/api/admin/alert-types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: row.type,
          animation: row.animation,
          position: row.position,
          soundUrl: row.soundUrl,
          minAmount: row.minAmount,
        }),
      });
      const d = await res.json();
      if (!res.ok) onToast("err", d.error ?? "Błąd");
      else { onToast("ok", `Zapisano: ${row.label}`); patch(row.type, "configured", true); }
    } catch {
      onToast("err", "Błąd sieci");
    } finally {
      setSavingType(null);
    }
  }

  return (
    <div className="mb-4">
      <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-2">
        Typy alertów — ● włącz/wyłącz · kliknij nazwę, by dostosować ({enabledTypes.length} aktywnych)
      </div>
      <div className="space-y-1.5">
        {ALERT_TYPE_LIST.map(({ type, label }) => {
          const active = enabledTypes.includes(type);
          const row = rows.find((r) => r.type === type);
          const open = openType === type;
          return (
            <div key={type} className={cn("border", active ? "border-red-900/60 bg-red-950/10" : "border-zinc-800 bg-black/30")}>
              <div className="flex items-center gap-2 px-2.5 py-1.5">
                <button
                  type="button"
                  onClick={() => onToggle(type)}
                  title={active ? "Wyłącz ten typ alertu" : "Włącz ten typ alertu"}
                  className={cn("text-base leading-none shrink-0", active ? "text-red-400" : "text-zinc-600 hover:text-zinc-400")}
                >
                  {active ? "●" : "○"}
                </button>
                <button
                  type="button"
                  onClick={() => setOpenType(open ? null : type)}
                  className="flex-1 flex items-center justify-between gap-2 text-left"
                >
                  <span className={cn("text-xs", active ? "text-zinc-200" : "text-zinc-500")}>{label}</span>
                  <span className="flex items-center gap-2 shrink-0">
                    {row?.configured && <span className="text-[9px] font-mono uppercase tracking-widest text-green-500">własne</span>}
                    <span className="text-zinc-500 text-[10px]">{open ? "▴" : "▾"}</span>
                  </span>
                </button>
              </div>
              {open && (
                <div className="border-t border-zinc-800/70 p-2.5">
                  {!row ? (
                    <p className="text-zinc-600 text-[10px]">Ładowanie ustawień…</p>
                  ) : (
                    <>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-1">Animacja</label>
                          <select value={row.animation} onChange={(e) => patch(type, "animation", e.target.value)} className="w-full bg-black border border-zinc-800 px-2 py-1.5 text-xs text-white outline-hidden focus:border-red-500">
                            {ALERT_ANIMATIONS.map((a) => <option key={a} value={a}>{ANIMATION_LABELS[a]}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-1">Pozycja</label>
                          <select value={row.position} onChange={(e) => patch(type, "position", e.target.value)} className="w-full bg-black border border-zinc-800 px-2 py-1.5 text-xs text-white outline-hidden focus:border-red-500">
                            {ALERT_POSITIONS.map((p) => <option key={p} value={p}>{POSITION_LABELS[p]}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-1">Dźwięk (URL, opcjonalnie)</label>
                          <input type="text" value={row.soundUrl ?? ""} onChange={(e) => patch(type, "soundUrl", e.target.value || null)} placeholder="https://…/sound.mp3" className="w-full bg-black border border-zinc-800 px-2 py-1.5 text-xs text-white outline-hidden focus:border-red-500" />
                        </div>
                        <div>
                          <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-1">Próg kwoty (≥, opcjonalnie)</label>
                          <input type="number" min={0} value={row.minAmount ?? ""} onChange={(e) => patch(type, "minAmount", e.target.value === "" ? null : Math.max(0, parseInt(e.target.value) || 0))} placeholder="np. 50" className="w-full bg-black border border-zinc-800 px-2 py-1.5 text-xs text-white outline-hidden focus:border-red-500" />
                        </div>
                      </div>
                      <button
                        onClick={() => save(row)}
                        disabled={savingType === type || !loaded}
                        className="mt-2 px-3 py-1.5 bg-green-700 hover:bg-green-600 text-white text-[10px] font-bold tracking-widest uppercase transition-all disabled:opacity-50 inline-flex items-center gap-1.5"
                      >
                        {savingType === type ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                        Zapisz ustawienia
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ChatOverlayCard({
  onToast,
}: {
  onToast: (k: "ok" | "err", m: string) => void;
  onSuccess: () => void;
  pending: boolean;
}) {
  const [cfg, setCfg] = useState<ChatOverlayCfg>(DEFAULT_CHAT_CFG);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/chat-overlay")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled) { if (d?.config) setCfg(d.config); setLoaded(true); } })
      .catch(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, []);

  function set<K extends keyof ChatOverlayCfg>(k: K, v: ChatOverlayCfg[K]) {
    setCfg((c) => ({ ...c, [k]: v }));
  }

  async function save() {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/chat-overlay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cfg),
      });
      const d = await res.json();
      if (!res.ok) onToast("err", d.error ?? "Błąd");
      else onToast("ok", "Wygląd czatu zapisany");
    } catch {
      onToast("err", "Błąd sieci");
    } finally {
      setBusy(false);
    }
  }

  const sample: ChatMsg[] = [
    { id: "p1", platform: "twitch", username: "ghost_fan", message: "siema, jak leci? 🔥" },
    { id: "p2", platform: "kick", username: "kicker99", message: "POG, najlepszy stream!" },
    { id: "p3", platform: "youtube", username: "ytviewer", message: "pozdrawiam z YT 👋" },
  ];

  return (
    <SectionCard title="Chat overlay (OBS) — wygląd" icon={MessageSquare}>
      <div className="space-y-4">
        <p className="text-zinc-500 text-xs leading-relaxed">
          Czat z Twitch / Kick / YouTube w jednym oknie. Dostosuj wygląd wiadomości — zmiany lecą na overlay i na podgląd na żywo poniżej.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-1">Rozmiar tekstu: {cfg.fontSize}px</label>
            <input type="range" min={10} max={40} value={cfg.fontSize} onChange={(e) => set("fontSize", parseInt(e.target.value))} className="w-full accent-red-500" />
          </div>
          <div>
            <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-1">Krycie tła: {Math.round(cfg.bgOpacity * 100)}%</label>
            <input type="range" min={0} max={100} value={Math.round(cfg.bgOpacity * 100)} onChange={(e) => set("bgOpacity", parseInt(e.target.value) / 100)} className="w-full accent-red-500" />
          </div>
          <div>
            <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-1">Kolor tekstu</label>
            <input type="color" value={cfg.textColor} onChange={(e) => set("textColor", e.target.value)} className="w-full h-9 bg-black border border-zinc-800 cursor-pointer" />
          </div>
          <div>
            <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-1">Czcionka</label>
            <select value={cfg.fontFamily} onChange={(e) => set("fontFamily", e.target.value)} className="w-full bg-black border border-zinc-800 px-3 py-2 text-sm text-white outline-hidden focus:border-red-500">
              {Object.keys(CHAT_FONTS).map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
        </div>

        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={cfg.showPlatformIcon} onChange={(e) => set("showPlatformIcon", e.target.checked)} className="accent-red-500" />
          <span className="text-[10px] font-bold tracking-widest uppercase text-zinc-300">Pokaż ikonę platformy (🟣🟢🔴)</span>
        </label>

        <button
          onClick={save}
          disabled={busy || !loaded}
          className="w-full px-4 py-2 bg-green-700 hover:bg-green-600 text-white text-xs font-bold tracking-widest uppercase transition-all disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          Zapisz wygląd
        </button>

        <OverlayPreview path="/overlay/chat" note="Wiadomości pojawiają się od dołu ekranu; kolor paska wg platformy. Podgląd reaguje na ustawienia powyżej.">
          {sample.map((m) => <ChatMessageRow key={m.id} msg={m} cfg={cfg} />)}
        </OverlayPreview>
      </div>
    </SectionCard>
  );
}

// ============== CODE DROPS (overlay giveaway codes — admin only) ==============

type CodeRow = { id: string; code: string; label: string | null; active: boolean; shownCount: number; lastShownAt: string | null };
type CodeConfig = { enabled: boolean; intervalSeconds: number; title: string; accentColor: string };

function CodeDropsCard({
  codes, config, overlayToken, onToast,
}: {
  codes: CodeRow[];
  config: CodeConfig;
  overlayToken: string | null;
  onToast: (k: "ok" | "err", m: string) => void;
  onSuccess: () => void;
  pending: boolean;
}) {
  const [list, setList] = useState<CodeRow[]>(codes);
  const [enabled, setEnabled] = useState(config.enabled);
  const [intervalMin, setIntervalMin] = useState(String(Math.max(1, Math.round(config.intervalSeconds / 60))));
  const [title, setTitle] = useState(config.title);
  const [accent, setAccent] = useState(config.accentColor);
  const [bulk, setBulk] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const overlayUrl = overlayToken ? `${origin}/overlay/codes?token=${overlayToken}` : null;
  const activeCount = list.filter((c) => c.active).length;

  async function reload() {
    try {
      const r = await fetch("/api/admin/section-data?s=codes");
      if (r.ok) { const d = await r.json(); setList(d.codes ?? []); }
    } catch { /* keep current list */ }
  }

  async function call(payload: Record<string, unknown>, okMsg?: string) {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) { onToast("err", data.error ?? "Błąd"); return false; }
      if (okMsg) onToast("ok", okMsg);
      return true;
    } catch {
      onToast("err", "Błąd sieci");
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <SectionCard title="Drop kodów (overlay)" icon={Gift}>
      <div className="space-y-4">
        <p className="text-xs text-zinc-500 leading-relaxed">
          Pula kodów (np. klucze do gier). Overlay losuje i pokazuje <strong className="text-zinc-300">jeden kod na ekranie</strong>,
          zmieniając go co ustawiony czas. Każdy kod wejdzie zanim któryś się powtórzy.
        </p>

        {/* Config */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="flex items-center gap-2 border border-zinc-800 bg-black/30 p-2 cursor-pointer">
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="accent-green-500" />
            <span className="text-[10px] font-bold tracking-widest uppercase text-zinc-300">Overlay włączony</span>
          </label>
          <FieldInput label="Zmiana kodu co (minuty)" value={intervalMin} onChange={setIntervalMin} type="number" placeholder="10" />
          <FieldInput label="Nagłówek na karcie" value={title} onChange={setTitle} placeholder="Darmowy kod!" />
          <div>
            <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-1">Kolor akcentu</label>
            <input type="color" value={accent} onChange={(e) => setAccent(e.target.value)} className="w-full h-9 bg-black border border-zinc-800 cursor-pointer" />
          </div>
        </div>
        <button
          onClick={() => call({ action: "config", enabled, intervalSeconds: Math.max(1, parseInt(intervalMin) || 10) * 60, title, accentColor: accent }, "Ustawienia zapisane")}
          disabled={busy}
          className="w-full px-4 py-2 bg-green-700 hover:bg-green-600 text-white text-xs font-bold tracking-widest uppercase transition-all disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          Zapisz ustawienia
        </button>

        {/* Live preview */}
        <div>
          <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-1">Podgląd (tak wygląda na streamie)</label>
          <div className="border border-zinc-800 rounded-sm p-6 flex justify-center" style={{ background: "repeating-conic-gradient(#18181b 0% 25%, #0a0a0a 0% 50%) 50% / 24px 24px" }}>
            <CodeCard title={title || "Kod"} label="Cyberpunk 2077 (Steam)" code="ABCD-EFGH-IJKL" accent={accent} />
          </div>
        </div>

        {/* Overlay URL */}
        {overlayUrl && (
          <div>
            <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-1">URL do OBS (Browser Source)</label>
            <div className="flex gap-2">
              <input readOnly value={overlayUrl} className="flex-1 bg-black border border-zinc-800 px-3 py-2 text-xs text-zinc-300 font-mono truncate" />
              <button
                onClick={() => { navigator.clipboard.writeText(overlayUrl); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
                className="px-3 border border-zinc-700 text-zinc-300 hover:border-zinc-500 transition-all"
                title="Kopiuj"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
        )}

        {/* Bulk add */}
        <div>
          <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-1">
            Dodaj kody (jeden na linię; opcjonalnie „Etykieta | KOD")
          </label>
          <textarea
            value={bulk}
            onChange={(e) => setBulk(e.target.value)}
            rows={4}
            placeholder={"Cyberpunk 2077 (Steam) | ABCD-EFGH-IJKL\nXXXX-YYYY-ZZZZ"}
            className="w-full bg-black border border-zinc-800 px-3 py-2 text-sm text-white font-mono focus:border-green-600 outline-hidden"
          />
          <button
            onClick={async () => { if (await call({ action: "add", text: bulk }, "Kody dodane")) { setBulk(""); await reload(); } }}
            disabled={busy || !bulk.trim()}
            className="mt-2 w-full px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-bold tracking-widest uppercase transition-all disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <Plus className="w-3.5 h-3.5" /> Dodaj kody
          </button>
        </div>

        {/* List */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-zinc-400">{list.length} kodów ({activeCount} aktywnych)</span>
            <div className="flex gap-3">
              <button
                onClick={async () => { if (await call({ action: "reset_shown" }, "Liczniki wyzerowane")) await reload(); }}
                disabled={busy}
                className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 hover:text-zinc-300 disabled:opacity-50"
              >
                Zeruj liczniki
              </button>
              <button
                onClick={async () => { if (window.confirm("Usunąć WSZYSTKIE kody?") && await call({ action: "clear" }, "Wszystkie kody usunięte")) await reload(); }}
                disabled={busy}
                className="text-[10px] font-mono uppercase tracking-widest text-red-400 hover:text-red-300 disabled:opacity-50"
              >
                Usuń wszystkie
              </button>
            </div>
          </div>
          <div className="space-y-1 max-h-[320px] overflow-y-auto">
            {list.length === 0 && <p className="text-zinc-600 text-sm py-2">Brak kodów — dodaj pulę powyżej.</p>}
            {list.map((c) => (
              <div
                key={c.id}
                className={cn(
                  "flex items-center gap-2 border px-2 py-1.5",
                  c.active ? "border-zinc-800 bg-zinc-950" : "border-zinc-900 bg-black/40 opacity-60",
                )}
              >
                <div className="flex-1 min-w-0">
                  {c.label && <div className="text-[11px] text-zinc-400 truncate">{c.label}</div>}
                  <div className="font-mono text-xs text-white truncate">{c.code}</div>
                </div>
                <span className="text-[9px] font-mono text-zinc-500 whitespace-nowrap" title="Ile razy pokazany">×{c.shownCount}</span>
                <button
                  onClick={async () => { if (await call({ action: "toggle", id: c.id })) await reload(); }}
                  disabled={busy}
                  title={c.active ? "Wyłącz z rotacji" : "Włącz do rotacji"}
                  className="text-zinc-500 hover:text-white disabled:opacity-50"
                >
                  {c.active ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                </button>
                <button
                  onClick={async () => { if (await call({ action: "delete", id: c.id })) await reload(); }}
                  disabled={busy}
                  title="Usuń"
                  className="text-zinc-500 hover:text-red-400 disabled:opacity-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </SectionCard>
  );
}

// ============== DATABASE RESET (danger zone — admin only) ==============

function DatabaseResetCard({
  onToast,
}: {
  onToast: (k: "ok" | "err", m: string) => void;
  onSuccess: () => void;
  pending: boolean;
}) {
  const PHRASE = "USUŃ WSZYSTKO";
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const armed = confirm.trim() === PHRASE;

  async function submit() {
    if (!armed) return;
    if (!window.confirm(
      "OSTATNIE OSTRZEŻENIE\n\nTo NIEODWRACALNIE usunie WSZYSTKICH użytkowników i ich dane " +
      "(także Twoje konto — zalogujesz się ponownie). Konfiguracja i katalog zostają.\n\nKontynuować?",
    )) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/reset-database", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: confirm.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        onToast("err", data.error ?? "Błąd");
        setBusy(false);
        return;
      }
      onToast("ok", `Baza zresetowana — usunięto ${data.deletedUsers} użytkowników. Wylogowuję…`);
      // The acting admin's account is gone too — sign out and back to landing.
      setTimeout(() => signOut({ callbackUrl: "/welcome" }), 1800);
    } catch {
      onToast("err", "Błąd sieci");
      setBusy(false);
    }
  }

  return (
    <SectionCard title="Reset bazy danych" icon={AlertTriangle}>
      <div className="space-y-3 border border-red-800 bg-red-950/20 p-4">
        <p className="text-sm text-red-300 font-bold flex items-center gap-2">
          <Trash2 className="w-4 h-4" /> Strefa niebezpieczna — operacja NIEODWRACALNA
        </p>
        <p className="text-xs text-zinc-400 leading-relaxed">
          Usuwa <strong className="text-white">wszystkich użytkowników</strong> i ich dane: konta i logowania,
          połączone platformy, tokeny i transakcje, osiągnięcia, questy, progres battle passa, zakłady,
          udziały w eventach, powiadomienia i social linki. Czyści też kolejkę alertów, feed czatu oraz logi
          zdarzeń (Twitch / Kick / YouTube). Użytkownicy zalogują się od nowa (z bonusem powitalnym).
        </p>
        <p className="text-xs text-zinc-400 leading-relaxed">
          <strong className="text-green-300">Zostaje:</strong> konfiguracja i katalog — sklep, definicje eventów,
          osiągnięć, questów i dropów, sezony battle passa, komendy / timery / FAQ czatu, harmonogram, ustawienia
          alertów, integracje (Twitch / Kick / YouTube / Streamlabs) oraz audit log. Konto właściciela wraca jako
          admin po ponownym zalogowaniu.
        </p>
        <div>
          <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-1">
            Wpisz dokładnie <span className="text-red-400 font-bold">{PHRASE}</span>, aby odblokować
          </label>
          <input
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder={PHRASE}
            className="w-full bg-black border border-zinc-800 px-3 py-2 text-sm text-white focus:border-red-500 outline-hidden"
          />
        </div>
        <button
          onClick={submit}
          disabled={busy || !armed}
          className="w-full px-4 py-2.5 bg-red-700 hover:bg-red-600 text-white text-xs font-bold tracking-widest uppercase transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
          Zresetuj bazę danych
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
        className="w-full border border-zinc-800 bg-black/30 px-3 py-2 text-sm text-white font-mono outline-hidden focus:border-red-600 placeholder:text-zinc-700"
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
        className="w-full border border-zinc-800 bg-black/30 px-3 py-2 text-sm text-white outline-hidden focus:border-red-600 resize-y"
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
  const [sizeScale, setSizeScale] = useState(data.settings.sizeScale ?? 1);
  const [textScale, setTextScale] = useState(data.settings.textScale ?? 1);
  const [textColor, setTextColor] = useState(data.settings.textColor ?? "#d4d4d8");
  const [busy, setBusy] = useState(false);
  const [tokenVisible, setTokenVisible] = useState(false);
  const [tokenCopied, setTokenCopied] = useState(false);
  const [urlCopied, setUrlCopied] = useState(false);

  const previewAlerts = [
    { title: "Nowy sub!", message: "zasubował kanał — dzięki za wsparcie!", icon: "💜", actorName: "Widz_123", amount: 5000, amountLabel: "GT" },
    { title: "Donacja!", message: "postawił kawę 💸", icon: "💰", actorName: "Anonim", amount: 20, amountLabel: "PLN" },
  ];

  const dirty =
    JSON.stringify([...enabledTypes].sort()) !== JSON.stringify([...data.settings.enabledTypes].sort()) ||
    durationMs !== data.settings.durationMs ||
    accentColor !== data.settings.accentColor ||
    soundEnabled !== data.settings.soundEnabled ||
    sizeScale !== (data.settings.sizeScale ?? 1) ||
    textScale !== (data.settings.textScale ?? 1) ||
    textColor !== (data.settings.textColor ?? "#d4d4d8");

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
          sizeScale,
          textScale,
          textColor,
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

      {/* Live preview — odzwierciedla kolor akcentu wybrany niżej */}
      <div className="border border-zinc-800 bg-black/40 p-4 mb-3">
        <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-3">
          Podgląd na żywo — tak alert wygląda na overlayu OBS
        </div>
        <div className="mx-auto flex flex-col items-center gap-3 overflow-hidden" style={{ maxWidth: 520 }}>
          {previewAlerts.map((a, i) => (
            <AlertCard key={i} alert={a} accent={accentColor} sizeScale={sizeScale} textScale={textScale} textColor={textColor} />
          ))}
        </div>
        <p className="text-[10px] text-zinc-600 mt-3 text-center">
          Zmień kolor akcentu poniżej — podgląd zaktualizuje się od razu.
        </p>
      </div>

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
        <div>
          <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-1">
            Rozmiar alertu
          </label>
          <div className="flex items-center gap-2">
            <input
              type="range" min={50} max={200} step={5}
              value={Math.round(sizeScale * 100)}
              onChange={(e) => setSizeScale(parseInt(e.target.value, 10) / 100)}
              className="flex-1"
            />
            <span className="text-xs text-white font-mono tabular-nums w-12 text-right">{Math.round(sizeScale * 100)}%</span>
          </div>
        </div>
        <div>
          <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-1">
            Rozmiar tekstu
          </label>
          <div className="flex items-center gap-2">
            <input
              type="range" min={50} max={200} step={5}
              value={Math.round(textScale * 100)}
              onChange={(e) => setTextScale(parseInt(e.target.value, 10) / 100)}
              className="flex-1"
            />
            <span className="text-xs text-white font-mono tabular-nums w-12 text-right">{Math.round(textScale * 100)}%</span>
          </div>
        </div>
        <div>
          <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-1">
            Kolor tekstu
          </label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={textColor}
              onChange={(e) => setTextColor(e.target.value)}
              className="w-10 h-8 border border-zinc-800 bg-black/30 cursor-pointer"
            />
            <input
              type="text"
              value={textColor}
              onChange={(e) => setTextColor(e.target.value)}
              className="flex-1 border border-zinc-800 bg-black/30 px-2 py-1.5 text-xs font-mono text-white outline-hidden focus:border-red-600"
            />
          </div>
        </div>
      </div>

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
              className="flex-1 border border-zinc-800 bg-black/30 px-2 py-1.5 text-xs font-mono text-white outline-hidden focus:border-red-600"
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

      {/* Per-type: enable/disable + click to customize (animation/position/sound/threshold) */}
      <AlertTypeList enabledTypes={enabledTypes} onToggle={toggleType} onToast={onToast} />

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
                  {a.icon ?? "🔔"} {a.actorName ? <strong>{a.actorName.includes(" ") ? a.actorName.split(" ")[0] : a.actorName}</strong> : null} {a.message}
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
                     
                    <img src={u.image} alt="" width={32} height={32} loading="lazy" decoding="async" referrerPolicy="no-referrer" className="w-8 h-8 rounded-full border border-zinc-800" />
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
                    className="flex-1 border border-zinc-700 bg-black/40 px-2.5 py-1.5 text-xs text-white font-mono outline-hidden focus:border-red-600"
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
    <SectionCard title="YouTube Live Chat (Super Chats + Members)" icon={MonitorPlay}>
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
              <MonitorPlay className="w-3.5 h-3.5" />
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

type SongRow = {
  id: string;
  query: string;
  title: string | null;
  requestedBy: string;
  platform: string;
  status: string;
  createdAt: string;
};

function SongQueueManager({
  onToast, onSuccess, pending,
}: {
  onToast: (k: "ok" | "err", m: string) => void;
  onSuccess: () => void;
  pending: boolean;
}) {
  const [loading, setLoading] = useState(true);
  const [queue, setQueue] = useState<SongRow[]>([]);
  const [recent, setRecent] = useState<SongRow[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/song-requests");
      const data = await res.json();
      if (res.ok) {
        setQueue(data.queue ?? []);
        setRecent(data.recent ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // Live-ish queue: refresh every 10s while the section is open.
  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 10_000);
    return () => clearInterval(t);
  }, [load]);

  async function call(action: string, id?: string) {
    const res = await fetch("/api/admin/song-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, id }),
    });
    const data = await res.json();
    if (!res.ok) {
      onToast("err", data.error ?? "Błąd");
      return false;
    }
    return true;
  }

  async function act(action: string, id: string) {
    setBusy(id);
    if (await call(action, id)) await load();
    setBusy(null);
  }

  async function clearQueue() {
    if (!confirm("Wyczyścić całą kolejkę?")) return;
    setBusy("clear");
    if (await call("clear")) {
      onToast("ok", "Kolejka wyczyszczona");
      await load();
      onSuccess();
    }
    setBusy(null);
  }

  const platformColor: Record<string, string> = {
    twitch: "#9146FF",
    kick: "#53FC18",
    youtube: "#FF0000",
  };

  function renderQuery(q: string, title?: string | null) {
    const label = title || q;
    if (/^https?:\/\//i.test(q)) {
      return (
        <a href={q} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-400 hover:underline truncate" title={q}>
          {label}
        </a>
      );
    }
    return <span className="text-sm text-zinc-300 truncate">{label}</span>;
  }

  return (
    <SectionCard title="Song requests (kolejka)" icon={Music}>
      <p className="text-zinc-500 text-xs mb-3">
        Widzowie dodają utwory komendą <code className="text-zinc-300">!sr &lt;link lub tytuł&gt;</code> na dowolnej platformie.
        Tutaj odtwarzasz / pomijasz / czyścisz kolejkę (odświeża się co 10 s).
      </p>

      {loading ? (
        <div className="text-xs text-zinc-500 flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin" /> Ładowanie…</div>
      ) : (
        <>
          {queue.length === 0 ? (
            <div className="text-xs text-zinc-500 text-center py-4 border border-zinc-900 bg-black/20 mb-3">
              Kolejka pusta.
            </div>
          ) : (
            <div className="space-y-2 mb-3">
              {queue.map((s, i) => {
                const playing = s.status === "playing";
                return (
                  <div
                    key={s.id}
                    className={cn(
                      "border bg-black/30 p-3",
                      playing ? "border-green-700 bg-green-950/20" : "border-zinc-800",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <span className={cn("text-[11px] font-mono w-5 text-center shrink-0", playing ? "text-green-400" : "text-zinc-600")}>
                          {playing ? "▶" : i + 1}
                        </span>
                        <div className="flex flex-col min-w-0">
                          {renderQuery(s.query, s.title)}
                          <span className="text-[10px] text-zinc-500">
                            od <strong className="text-zinc-400">{s.requestedBy}</strong>
                            <span className="ml-1 font-mono uppercase" style={{ color: platformColor[s.platform] ?? "#888" }}>
                              {s.platform}
                            </span>
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {!playing && (
                          <button
                            onClick={() => act("play", s.id)}
                            disabled={busy === s.id || pending}
                            className="text-green-400 hover:text-green-300 border border-zinc-800 hover:border-green-700 w-6 h-6 flex items-center justify-center"
                            title="Odtwarzaj"
                          >
                            <Play className="w-3 h-3" />
                          </button>
                        )}
                        {playing && (
                          <button
                            onClick={() => act("played", s.id)}
                            disabled={busy === s.id || pending}
                            className="text-zinc-400 hover:text-white border border-zinc-800 hover:border-zinc-600 px-2 h-6 text-[9px] font-mono uppercase"
                            title="Oznacz jako odtworzone"
                          >
                            <Check className="w-3 h-3" />
                          </button>
                        )}
                        <button
                          onClick={() => act("skip", s.id)}
                          disabled={busy === s.id || pending}
                          className="text-zinc-500 hover:text-orange-400 border border-zinc-800 hover:border-orange-700 w-6 h-6 flex items-center justify-center"
                          title="Pomiń"
                        >
                          <SkipForward className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => act("delete", s.id)}
                          disabled={busy === s.id || pending}
                          className="text-red-500 hover:text-red-400 border border-zinc-800 hover:border-red-700 w-6 h-6 flex items-center justify-center"
                          title="Usuń"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {queue.length > 0 && (
            <button
              onClick={clearQueue}
              disabled={busy === "clear" || pending}
              className="border border-zinc-800 hover:border-red-700 text-zinc-400 hover:text-red-300 px-3 py-1.5 text-xs font-mono uppercase tracking-widest mb-4 disabled:opacity-50"
            >
              Wyczyść kolejkę
            </button>
          )}

          {recent.length > 0 && (
            <div className="border-t border-zinc-900 pt-3">
              <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-600 mb-2">Ostatnie</div>
              <div className="space-y-1">
                {recent.map((s) => (
                  <div key={s.id} className="flex items-center gap-2 text-xs text-zinc-600">
                    <span className="font-mono uppercase text-[9px] w-12 shrink-0">{s.status === "played" ? "✓ grane" : "pominięte"}</span>
                    <span className="truncate">{s.query}</span>
                    <span className="text-zinc-700 shrink-0">— {s.requestedBy}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </SectionCard>
  );
}

function WelcomeManager({
  onToast, onSuccess, pending,
}: {
  onToast: (k: "ok" | "err", m: string) => void;
  onSuccess: () => void;
  pending: boolean;
}) {
  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [template, setTemplate] = useState("");
  const [bonus, setBonus] = useState("0");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/welcome");
      const data = await res.json();
      if (res.ok && data.config) {
        setEnabled(!!data.config.enabled);
        setTemplate(data.config.template ?? "");
        setBonus(String(data.config.bonusTokens ?? 0));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function save(next: { enabled?: boolean; template?: string; bonusTokens?: number }) {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/welcome", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      const data = await res.json();
      if (res.ok) {
        onToast("ok", "Zapisano");
        onSuccess();
        return true;
      }
      onToast("err", data.error ?? "Błąd");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function toggle() {
    const next = !enabled;
    setEnabled(next);
    if (!(await save({ enabled: next }))) setEnabled(!next); // revert on failure
  }

  async function saveSettings() {
    if (!template.trim()) {
      onToast("err", "Szablon nie może być pusty");
      return;
    }
    await save({ template, bonusTokens: Math.max(0, parseInt(bonus, 10) || 0) });
  }

  return (
    <SectionCard title="Powitania" icon={UserPlus}>
      <p className="text-zinc-500 text-xs mb-3">
        Bot wita <strong>pierwszą wiadomość</strong> widza w danym streamie, na Twitch + Kick + YouTube.
        Użyj <code className="text-zinc-300">{"{user}"}</code> jako nazwy widza.
      </p>

      {loading ? (
        <div className="text-xs text-zinc-500 flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin" /> Ładowanie…</div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between border border-zinc-800 bg-black/30 px-3 py-2.5">
            <span className="text-sm text-zinc-300">
              Powitania: <strong className={enabled ? "text-green-400" : "text-zinc-500"}>{enabled ? "WŁĄCZONE" : "WYŁĄCZONE"}</strong>
            </span>
            <button
              onClick={toggle}
              disabled={busy || pending}
              className={cn(
                "px-3 py-1.5 text-[10px] font-mono uppercase tracking-widest border disabled:opacity-50",
                enabled
                  ? "border-zinc-700 text-zinc-400 hover:border-zinc-500"
                  : "border-green-800 bg-green-950/30 text-green-300 hover:border-green-600",
              )}
            >
              {enabled ? "Wyłącz" : "Włącz"}
            </button>
          </div>

          <div>
            <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-1">Szablon</div>
            <textarea
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
              rows={2}
              maxLength={300}
              placeholder="Witaj {user}! Miło Cię widzieć 👋"
              className="w-full bg-black border border-zinc-800 px-2 py-1.5 text-sm text-white focus:border-red-700 outline-hidden resize-none"
            />
            <div className="flex items-center gap-2 mt-3">
              <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">Bonus GT</span>
              <input
                type="number"
                value={bonus}
                onChange={(e) => setBonus(e.target.value)}
                min={0}
                title="GT przyznawane raz na widza na sesję przy powitaniu (0 = wyłączone)"
                className="w-24 bg-black border border-zinc-800 px-2 py-1.5 text-sm text-white focus:border-red-700 outline-hidden"
              />
              <span className="text-[10px] text-zinc-600">0 = bez nagrody (wymaga połączonego konta)</span>
            </div>
            <div className="mt-3">
              <button
                onClick={saveSettings}
                disabled={busy || pending}
                className="bg-red-900/40 border border-red-800 hover:border-red-600 text-red-200 px-3 py-1.5 text-xs font-mono uppercase tracking-widest flex items-center gap-1.5 disabled:opacity-50"
              >
                {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                Zapisz
              </button>
            </div>
          </div>
        </div>
      )}
    </SectionCard>
  );
}

type FaqRow = {
  id: string;
  keyword: string;
  matchType: string;
  response: string;
  cooldownSeconds: number;
  enabled: boolean;
};

function FaqManager({
  onToast, onSuccess, pending,
}: {
  onToast: (k: "ok" | "err", m: string) => void;
  onSuccess: () => void;
  pending: boolean;
}) {
  const [loading, setLoading] = useState(true);
  const [faqs, setFaqs] = useState<FaqRow[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [fKeyword, setFKeyword] = useState("");
  const [fMatchType, setFMatchType] = useState("contains");
  const [fResponse, setFResponse] = useState("");
  const [fCooldown, setFCooldown] = useState("30");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/faq");
      const data = await res.json();
      if (res.ok) setFaqs(data.faqs ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function call(action: string, payload: Record<string, unknown>) {
    const res = await fetch("/api/admin/faq", {
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

  function resetForm() {
    setEditingId(null);
    setFKeyword("");
    setFMatchType("contains");
    setFResponse("");
    setFCooldown("30");
  }

  function startEdit(f: FaqRow) {
    setEditingId(f.id);
    setFKeyword(f.keyword);
    setFMatchType(f.matchType);
    setFResponse(f.response);
    setFCooldown(String(f.cooldownSeconds));
  }

  async function submit() {
    const keyword = fKeyword.trim();
    const response = fResponse.trim();
    const cooldownSeconds = Math.max(0, parseInt(fCooldown, 10) || 0);
    if (!keyword || !response) {
      onToast("err", "Wpisz słowo kluczowe i odpowiedź");
      return;
    }
    setBusy("form");
    const payload = { keyword, matchType: fMatchType, response, cooldownSeconds };
    const ok = editingId
      ? await call("update", { id: editingId, ...payload })
      : await call("create", payload);
    if (ok) {
      onToast("ok", editingId ? "Zapisano" : "FAQ dodane");
      resetForm();
      await load();
      onSuccess();
    }
    setBusy(null);
  }

  async function toggleEnabled(f: FaqRow) {
    setBusy(f.id);
    if (await call("update", { id: f.id, enabled: !f.enabled })) await load();
    setBusy(null);
  }

  async function deleteFaq(f: FaqRow) {
    if (!confirm(`Usunąć FAQ "${f.keyword}"?`)) return;
    setBusy(f.id);
    if (await call("delete", { id: f.id })) {
      onToast("ok", "Usunięto");
      if (editingId === f.id) resetForm();
      await load();
    }
    setBusy(null);
  }

  return (
    <SectionCard title="FAQ / auto-odpowiedzi" icon={HelpCircle}>
      <p className="text-zinc-500 text-xs mb-3">
        Bot odpowiada, gdy wiadomość <strong>zawiera</strong> słowo kluczowe (nie tylko <code className="text-zinc-300">!komendy</code>).
        Działa na Twitch + Kick + YouTube. „Całe słowo" = dopasowanie tylko jako osobny wyraz.
      </p>

      {loading ? (
        <div className="text-xs text-zinc-500 flex items-center gap-2 mb-3"><Loader2 className="w-3 h-3 animate-spin" /> Ładowanie…</div>
      ) : (
        <div className="space-y-2 mb-4">
          {faqs.length === 0 ? (
            <div className="text-xs text-zinc-500 text-center py-4 border border-zinc-900 bg-black/20">
              Brak wpisów FAQ. Dodaj pierwszy poniżej.
            </div>
          ) : (
            faqs.map((f) => (
              <div
                key={f.id}
                className={cn(
                  "border bg-black/30 p-3",
                  f.enabled ? "border-zinc-800" : "border-zinc-900 opacity-60",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="text-[11px] font-mono px-1.5 py-0.5 border border-blue-800 bg-blue-950/30 text-blue-300 shrink-0">
                      {f.keyword}
                    </span>
                    <span className="text-[9px] font-mono uppercase text-zinc-600 shrink-0">
                      {f.matchType === "word" ? "słowo" : "zawiera"}
                    </span>
                    <span className="text-sm text-zinc-300 truncate">{f.response}</span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-[10px] font-mono text-zinc-600 mr-1" title="Cooldown">{f.cooldownSeconds}s</span>
                    <button
                      onClick={() => toggleEnabled(f)}
                      disabled={busy === f.id || pending}
                      className="text-zinc-500 hover:text-white border border-zinc-800 hover:border-zinc-600 w-6 h-6 flex items-center justify-center"
                      title={f.enabled ? "Wyłącz" : "Włącz"}
                    >
                      {f.enabled ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                    </button>
                    <button
                      onClick={() => startEdit(f)}
                      disabled={busy === f.id || pending}
                      className="text-zinc-500 hover:text-white border border-zinc-800 hover:border-zinc-600 w-6 h-6 flex items-center justify-center"
                      title="Edytuj"
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => deleteFaq(f)}
                      disabled={busy === f.id || pending}
                      className="text-red-500 hover:text-red-400 border border-zinc-800 hover:border-red-700 w-6 h-6 flex items-center justify-center"
                      title="Usuń"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Create / edit form */}
      <div className="border border-zinc-800 bg-black/30 p-3">
        <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-2">
          {editingId ? "Edytuj FAQ" : "Dodaj FAQ"}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-[160px_120px_1fr_90px] gap-2 mb-2">
          <input
            value={fKeyword}
            onChange={(e) => setFKeyword(e.target.value)}
            placeholder="słowo kluczowe"
            className="bg-black border border-zinc-800 px-2 py-1.5 text-sm text-white focus:border-red-700 outline-hidden"
          />
          <select
            value={fMatchType}
            onChange={(e) => setFMatchType(e.target.value)}
            className="bg-black border border-zinc-800 px-2 py-1.5 text-sm text-white focus:border-red-700 outline-hidden"
          >
            <option value="contains">zawiera</option>
            <option value="word">całe słowo</option>
          </select>
          <input
            value={fResponse}
            onChange={(e) => setFResponse(e.target.value)}
            placeholder="Odpowiedź bota…"
            className="bg-black border border-zinc-800 px-2 py-1.5 text-sm text-white focus:border-red-700 outline-hidden"
          />
          <input
            type="number"
            value={fCooldown}
            onChange={(e) => setFCooldown(e.target.value)}
            min={0}
            title="Cooldown (sekundy)"
            className="bg-black border border-zinc-800 px-2 py-1.5 text-sm text-white focus:border-red-700 outline-hidden"
          />
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={submit}
            disabled={busy === "form" || pending}
            className="bg-red-900/40 border border-red-800 hover:border-red-600 text-red-200 px-3 py-1.5 text-xs font-mono uppercase tracking-widest flex items-center gap-1.5 disabled:opacity-50"
          >
            {busy === "form" ? <Loader2 className="w-3 h-3 animate-spin" /> : editingId ? <Check className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
            {editingId ? "Zapisz" : "Dodaj"}
          </button>
          {editingId && (
            <button
              onClick={resetForm}
              disabled={busy === "form"}
              className="border border-zinc-800 hover:border-zinc-600 text-zinc-400 px-3 py-1.5 text-xs font-mono uppercase tracking-widest"
            >
              Anuluj
            </button>
          )}
        </div>
      </div>
    </SectionCard>
  );
}

type ChatTimerRow = {
  id: string;
  message: string;
  intervalSeconds: number;
  enabled: boolean;
};

function ChatTimersManager({
  onToast, onSuccess, pending,
}: {
  onToast: (k: "ok" | "err", m: string) => void;
  onSuccess: () => void;
  pending: boolean;
}) {
  const [loading, setLoading] = useState(true);
  const [timers, setTimers] = useState<ChatTimerRow[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [fMessage, setFMessage] = useState("");
  const [fMinutes, setFMinutes] = useState("15");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/chat-timers");
      const data = await res.json();
      if (res.ok) setTimers(data.timers ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function call(action: string, payload: Record<string, unknown>) {
    const res = await fetch("/api/admin/chat-timers", {
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

  function resetForm() {
    setEditingId(null);
    setFMessage("");
    setFMinutes("15");
  }

  function startEdit(t: ChatTimerRow) {
    setEditingId(t.id);
    setFMessage(t.message);
    setFMinutes(String(Math.max(1, Math.round(t.intervalSeconds / 60))));
  }

  async function submit() {
    const message = fMessage.trim();
    const minutes = Math.max(1, parseInt(fMinutes, 10) || 0);
    if (!message) {
      onToast("err", "Wpisz wiadomość");
      return;
    }
    setBusy("form");
    const intervalSeconds = minutes * 60;
    const ok = editingId
      ? await call("update", { id: editingId, message, intervalSeconds })
      : await call("create", { message, intervalSeconds });
    if (ok) {
      onToast("ok", editingId ? "Zapisano" : "Timer dodany");
      resetForm();
      await load();
      onSuccess();
    }
    setBusy(null);
  }

  async function toggleEnabled(t: ChatTimerRow) {
    setBusy(t.id);
    if (await call("update", { id: t.id, enabled: !t.enabled })) await load();
    setBusy(null);
  }

  async function deleteTimer(t: ChatTimerRow) {
    if (!confirm("Usunąć ten timer?")) return;
    setBusy(t.id);
    if (await call("delete", { id: t.id })) {
      onToast("ok", "Usunięto");
      if (editingId === t.id) resetForm();
      await load();
    }
    setBusy(null);
  }

  return (
    <SectionCard title="Timery (cykliczne wiadomości)" icon={Clock}>
      <p className="text-zinc-500 text-xs mb-3">
        Bot wrzuca te wiadomości co X minut na <strong>Twitch + Kick + YouTube</strong> —
        tylko gdy czat jest aktywny (czyli podczas streamu).
      </p>

      {loading ? (
        <div className="text-xs text-zinc-500 flex items-center gap-2 mb-3"><Loader2 className="w-3 h-3 animate-spin" /> Ładowanie…</div>
      ) : (
        <div className="space-y-2 mb-4">
          {timers.length === 0 ? (
            <div className="text-xs text-zinc-500 text-center py-4 border border-zinc-900 bg-black/20">
              Brak timerów. Dodaj pierwszy poniżej.
            </div>
          ) : (
            timers.map((t) => (
              <div
                key={t.id}
                className={cn(
                  "border bg-black/30 p-3",
                  t.enabled ? "border-zinc-800" : "border-zinc-900 opacity-60",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="text-[10px] font-mono px-1.5 py-0.5 border border-zinc-700 text-zinc-400 shrink-0">
                      co {Math.max(1, Math.round(t.intervalSeconds / 60))} min
                    </span>
                    <span className="text-sm text-zinc-300 truncate">{t.message}</span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => toggleEnabled(t)}
                      disabled={busy === t.id || pending}
                      className="text-zinc-500 hover:text-white border border-zinc-800 hover:border-zinc-600 w-6 h-6 flex items-center justify-center"
                      title={t.enabled ? "Wyłącz" : "Włącz"}
                    >
                      {t.enabled ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                    </button>
                    <button
                      onClick={() => startEdit(t)}
                      disabled={busy === t.id || pending}
                      className="text-zinc-500 hover:text-white border border-zinc-800 hover:border-zinc-600 w-6 h-6 flex items-center justify-center"
                      title="Edytuj"
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => deleteTimer(t)}
                      disabled={busy === t.id || pending}
                      className="text-red-500 hover:text-red-400 border border-zinc-800 hover:border-red-700 w-6 h-6 flex items-center justify-center"
                      title="Usuń"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Create / edit form */}
      <div className="border border-zinc-800 bg-black/30 p-3">
        <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-2">
          {editingId ? "Edytuj timer" : "Dodaj timer"}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-[1fr_140px] gap-2 mb-2">
          <input
            value={fMessage}
            onChange={(e) => setFMessage(e.target.value)}
            placeholder="Wiadomość (np. Wbijaj na portal po GT!)"
            className="bg-black border border-zinc-800 px-2 py-1.5 text-sm text-white focus:border-red-700 outline-hidden"
          />
          <div className="flex items-center gap-1">
            <input
              type="number"
              value={fMinutes}
              onChange={(e) => setFMinutes(e.target.value)}
              min={1}
              className="w-full bg-black border border-zinc-800 px-2 py-1.5 text-sm text-white focus:border-red-700 outline-hidden"
            />
            <span className="text-xs text-zinc-500 shrink-0">min</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={submit}
            disabled={busy === "form" || pending}
            className="bg-red-900/40 border border-red-800 hover:border-red-600 text-red-200 px-3 py-1.5 text-xs font-mono uppercase tracking-widest flex items-center gap-1.5 disabled:opacity-50"
          >
            {busy === "form" ? <Loader2 className="w-3 h-3 animate-spin" /> : editingId ? <Check className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
            {editingId ? "Zapisz" : "Dodaj"}
          </button>
          {editingId && (
            <button
              onClick={resetForm}
              disabled={busy === "form"}
              className="border border-zinc-800 hover:border-zinc-600 text-zinc-400 px-3 py-1.5 text-xs font-mono uppercase tracking-widest"
            >
              Anuluj
            </button>
          )}
        </div>
      </div>
    </SectionCard>
  );
}

type ChatCommandRow = {
  id: string;
  trigger: string;
  response: string;
  cooldownSeconds: number;
  enabled: boolean;
};

function ChatCommandsManager({
  onToast, onSuccess, pending,
}: {
  onToast: (k: "ok" | "err", m: string) => void;
  onSuccess: () => void;
  pending: boolean;
}) {
  const [loading, setLoading] = useState(true);
  const [commands, setCommands] = useState<ChatCommandRow[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  // Create / edit form
  const [editingId, setEditingId] = useState<string | null>(null);
  const [fTrigger, setFTrigger] = useState("");
  const [fResponse, setFResponse] = useState("");
  const [fCooldown, setFCooldown] = useState("15");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/chat-commands");
      const data = await res.json();
      if (res.ok) setCommands(data.commands ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function call(action: string, payload: Record<string, unknown>) {
    const res = await fetch("/api/admin/chat-commands", {
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

  function resetForm() {
    setEditingId(null);
    setFTrigger("");
    setFResponse("");
    setFCooldown("15");
  }

  function startEdit(c: ChatCommandRow) {
    setEditingId(c.id);
    setFTrigger(c.trigger);
    setFResponse(c.response);
    setFCooldown(String(c.cooldownSeconds));
  }

  async function submit() {
    const trigger = fTrigger.trim().toLowerCase();
    const response = fResponse.trim();
    const cooldownSeconds = Math.max(0, parseInt(fCooldown, 10) || 0);
    if (!trigger || !response) {
      onToast("err", "Wpisz trigger i odpowiedź");
      return;
    }
    setBusy("form");
    const ok = editingId
      ? await call("update", { id: editingId, trigger, response, cooldownSeconds })
      : await call("create", { trigger, response, cooldownSeconds });
    if (ok) {
      onToast("ok", editingId ? "Zapisano" : "Komenda dodana");
      resetForm();
      await load();
      onSuccess();
    }
    setBusy(null);
  }

  async function toggleEnabled(c: ChatCommandRow) {
    setBusy(c.id);
    if (await call("update", { id: c.id, enabled: !c.enabled })) await load();
    setBusy(null);
  }

  async function deleteCmd(c: ChatCommandRow) {
    if (!confirm(`Usunąć komendę ${c.trigger}?`)) return;
    setBusy(c.id);
    if (await call("delete", { id: c.id })) {
      onToast("ok", "Usunięto");
      if (editingId === c.id) resetForm();
      await load();
    }
    setBusy(null);
  }

  return (
    <SectionCard title="Komendy czatu" icon={MessageSquare}>
      <p className="text-zinc-500 text-xs mb-3">
        Działają na <strong>Twitch + Kick + YouTube</strong>. Bot pobiera włączone komendy co ~2 min.
        Trigger to pierwsze słowo wiadomości, np. <code className="text-zinc-300">!portal</code>.
      </p>

      {loading ? (
        <div className="text-xs text-zinc-500 flex items-center gap-2 mb-3"><Loader2 className="w-3 h-3 animate-spin" /> Ładowanie…</div>
      ) : (
        <div className="space-y-2 mb-4">
          {commands.length === 0 ? (
            <div className="text-xs text-zinc-500 text-center py-4 border border-zinc-900 bg-black/20">
              Brak komend. Dodaj pierwszą poniżej.
            </div>
          ) : (
            commands.map((c) => (
              <div
                key={c.id}
                className={cn(
                  "border bg-black/30 p-3",
                  c.enabled ? "border-zinc-800" : "border-zinc-900 opacity-60",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="text-[11px] font-mono px-1.5 py-0.5 border border-red-800 bg-red-950/30 text-red-300 shrink-0">
                      {c.trigger}
                    </span>
                    <span className="text-sm text-zinc-300 truncate">{c.response}</span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-[10px] font-mono text-zinc-600 mr-1" title="Cooldown">{c.cooldownSeconds}s</span>
                    <button
                      onClick={() => toggleEnabled(c)}
                      disabled={busy === c.id || pending}
                      className="text-zinc-500 hover:text-white border border-zinc-800 hover:border-zinc-600 w-6 h-6 flex items-center justify-center"
                      title={c.enabled ? "Wyłącz" : "Włącz"}
                    >
                      {c.enabled ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                    </button>
                    <button
                      onClick={() => startEdit(c)}
                      disabled={busy === c.id || pending}
                      className="text-zinc-500 hover:text-white border border-zinc-800 hover:border-zinc-600 w-6 h-6 flex items-center justify-center"
                      title="Edytuj"
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => deleteCmd(c)}
                      disabled={busy === c.id || pending}
                      className="text-red-500 hover:text-red-400 border border-zinc-800 hover:border-red-700 w-6 h-6 flex items-center justify-center"
                      title="Usuń"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Create / edit form */}
      <div className="border border-zinc-800 bg-black/30 p-3">
        <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-2">
          {editingId ? "Edytuj komendę" : "Dodaj komendę"}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-[160px_1fr_90px] gap-2 mb-2">
          <input
            value={fTrigger}
            onChange={(e) => setFTrigger(e.target.value)}
            placeholder="!komenda"
            className="bg-black border border-zinc-800 px-2 py-1.5 text-sm text-white font-mono focus:border-red-700 outline-hidden"
          />
          <input
            value={fResponse}
            onChange={(e) => setFResponse(e.target.value)}
            placeholder="Odpowiedź bota…"
            className="bg-black border border-zinc-800 px-2 py-1.5 text-sm text-white focus:border-red-700 outline-hidden"
          />
          <input
            type="number"
            value={fCooldown}
            onChange={(e) => setFCooldown(e.target.value)}
            min={0}
            title="Cooldown (sekundy)"
            className="bg-black border border-zinc-800 px-2 py-1.5 text-sm text-white focus:border-red-700 outline-hidden"
          />
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={submit}
            disabled={busy === "form" || pending}
            className="bg-red-900/40 border border-red-800 hover:border-red-600 text-red-200 px-3 py-1.5 text-xs font-mono uppercase tracking-widest flex items-center gap-1.5 disabled:opacity-50"
          >
            {busy === "form" ? <Loader2 className="w-3 h-3 animate-spin" /> : editingId ? <Check className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
            {editingId ? "Zapisz" : "Dodaj"}
          </button>
          {editingId && (
            <button
              onClick={resetForm}
              disabled={busy === "form"}
              className="border border-zinc-800 hover:border-zinc-600 text-zinc-400 px-3 py-1.5 text-xs font-mono uppercase tracking-widest"
            >
              Anuluj
            </button>
          )}
        </div>
      </div>
    </SectionCard>
  );
}

type SubathonData = {
  active: boolean;
  endsAt: string | null;
  startedAt: string | null;
  secondsPerSub: number;
  secondsPerPln: number;
  maxEndsAt: string | null;
  totalAddedSecs: number;
};

function subathonHMS(ms: number): string {
  const t = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

function SubathonManager({
  onToast, onSuccess, pending,
}: {
  onToast: (k: "ok" | "err", m: string) => void;
  onSuccess: () => void;
  pending: boolean;
}) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<SubathonData | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [, setTick] = useState(0);

  const [minutes, setMinutes] = useState("120");
  const [perSub, setPerSub] = useState("300");
  const [perPln, setPerPln] = useState("60");
  const [maxMinutes, setMaxMinutes] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/subathon");
      const d = await res.json();
      if (res.ok && d.subathon) {
        setData(d.subathon);
        setPerSub(String(d.subathon.secondsPerSub));
        setPerPln(String(d.subathon.secondsPerPln));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const reSync = setInterval(() => void load(), 10_000);
    const tick = setInterval(() => setTick((n) => n + 1), 1000);
    return () => { clearInterval(reSync); clearInterval(tick); };
  }, [load]);

  async function call(action: string, payload: Record<string, unknown>, okMsg: string) {
    setBusy(action);
    try {
      const res = await fetch("/api/admin/subathon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...payload }),
      });
      const d = await res.json();
      if (!res.ok) {
        onToast("err", d.error ?? "Błąd");
        return;
      }
      if (d.subathon) setData(d.subathon);
      onToast("ok", okMsg);
      onSuccess();
    } finally {
      setBusy(null);
    }
  }

  const remainingMs = data?.active && data.endsAt ? new Date(data.endsAt).getTime() - Date.now() : 0;

  return (
    <SectionCard title="Subathon" icon={Hourglass}>
      <p className="text-zinc-500 text-xs mb-3">
        Odliczanie przedłużane automatycznie przez <strong>suby/gifty</strong> (Twitch + Kick) i <strong>donacje</strong> (Streamlabs + YouTube).
      </p>

      <div className="mb-4">
        <OverlayPreview path="/overlay/subathon" note="Odliczanie pojawia się u góry ekranu, gdy subathon jest aktywny. Token współdzielony z alertami/goals.">
          <div className="flex justify-center">
            <SubathonCard remainingMs={2 * 3600 * 1000 + 34 * 60 * 1000 + 12 * 1000} ended={false} />
          </div>
        </OverlayPreview>
      </div>

      {loading ? (
        <div className="text-xs text-zinc-500 flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin" /> Ładowanie…</div>
      ) : data?.active ? (
        <div className="space-y-3">
          <div className="border border-red-800 bg-red-950/20 p-4 text-center">
            <div className="text-[10px] font-mono uppercase tracking-widest text-red-400">Pozostało</div>
            <div className="text-5xl font-black text-white tabular-nums my-1">{subathonHMS(remainingMs)}</div>
            <div className="text-[11px] text-zinc-500">
              koniec: {data.endsAt ? new Date(data.endsAt).toLocaleString("pl-PL") : "—"}
              {" · "}dodano łącznie: {Math.round(data.totalAddedSecs / 60)} min
              {data.maxEndsAt && <> · cap: {new Date(data.maxEndsAt).toLocaleTimeString("pl-PL")}</>}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {[10, 30, 60].map((m) => (
              <button
                key={m}
                onClick={() => call("addTime", { addMinutes: m }, `+${m} min`)}
                disabled={!!busy || pending}
                className="border border-zinc-700 hover:border-green-600 text-green-300 px-3 py-1.5 text-xs font-mono disabled:opacity-50"
              >
                +{m} min
              </button>
            ))}
            <button
              onClick={() => call("addTime", { addMinutes: -10 }, "−10 min")}
              disabled={!!busy || pending}
              className="border border-zinc-700 hover:border-orange-600 text-orange-300 px-3 py-1.5 text-xs font-mono disabled:opacity-50"
            >
              −10 min
            </button>
            <button
              onClick={() => { if (confirm("Zakończyć subathon?")) void call("stop", {}, "Zatrzymano"); }}
              disabled={!!busy || pending}
              className="border border-red-800 hover:border-red-600 text-red-300 px-3 py-1.5 text-xs font-mono uppercase tracking-widest disabled:opacity-50 ml-auto"
            >
              Stop
            </button>
          </div>

          <SubathonRates perSub={perSub} perPln={perPln} setPerSub={setPerSub} setPerPln={setPerPln} busy={!!busy || pending}
            onSave={() => call("settings", { secondsPerSub: parseInt(perSub, 10) || 0, secondsPerPln: parseInt(perPln, 10) || 0 }, "Tempo zapisane")} />
        </div>
      ) : (
        <div className="border border-zinc-800 bg-black/30 p-3 space-y-2">
          <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">Start subathonu</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <label className="text-xs text-zinc-400">Czas startowy (min)
              <input type="number" value={minutes} onChange={(e) => setMinutes(e.target.value)} min={1}
                className="w-full mt-1 bg-black border border-zinc-800 px-2 py-1.5 text-sm text-white focus:border-red-700 outline-hidden" />
            </label>
            <label className="text-xs text-zinc-400">Sek / sub
              <input type="number" value={perSub} onChange={(e) => setPerSub(e.target.value)} min={0}
                className="w-full mt-1 bg-black border border-zinc-800 px-2 py-1.5 text-sm text-white focus:border-red-700 outline-hidden" />
            </label>
            <label className="text-xs text-zinc-400">Sek / PLN
              <input type="number" value={perPln} onChange={(e) => setPerPln(e.target.value)} min={0}
                className="w-full mt-1 bg-black border border-zinc-800 px-2 py-1.5 text-sm text-white focus:border-red-700 outline-hidden" />
            </label>
            <label className="text-xs text-zinc-400">Max (min, opcj.)
              <input type="number" value={maxMinutes} onChange={(e) => setMaxMinutes(e.target.value)} min={0} placeholder="bez limitu"
                className="w-full mt-1 bg-black border border-zinc-800 px-2 py-1.5 text-sm text-white focus:border-red-700 outline-hidden" />
            </label>
          </div>
          <button
            onClick={() => call("start", {
              minutes: parseInt(minutes, 10) || 0,
              secondsPerSub: parseInt(perSub, 10) || 0,
              secondsPerPln: parseInt(perPln, 10) || 0,
              ...(parseInt(maxMinutes, 10) > 0 ? { maxMinutes: parseInt(maxMinutes, 10) } : {}),
            }, "Subathon wystartował")}
            disabled={!!busy || pending}
            className="bg-red-900/40 border border-red-800 hover:border-red-600 text-red-200 px-3 py-1.5 text-xs font-mono uppercase tracking-widest flex items-center gap-1.5 disabled:opacity-50"
          >
            {busy === "start" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
            Start
          </button>
        </div>
      )}
    </SectionCard>
  );
}

function SubathonRates({
  perSub, perPln, setPerSub, setPerPln, busy, onSave,
}: {
  perSub: string; perPln: string;
  setPerSub: (v: string) => void; setPerPln: (v: string) => void;
  busy: boolean; onSave: () => void;
}) {
  return (
    <div className="flex flex-wrap items-end gap-2 border border-zinc-900 bg-black/20 p-3">
      <label className="text-xs text-zinc-400">Sek / sub
        <input type="number" value={perSub} onChange={(e) => setPerSub(e.target.value)} min={0}
          className="w-24 mt-1 bg-black border border-zinc-800 px-2 py-1.5 text-sm text-white focus:border-red-700 outline-hidden block" />
      </label>
      <label className="text-xs text-zinc-400">Sek / PLN
        <input type="number" value={perPln} onChange={(e) => setPerPln(e.target.value)} min={0}
          className="w-24 mt-1 bg-black border border-zinc-800 px-2 py-1.5 text-sm text-white focus:border-red-700 outline-hidden block" />
      </label>
      <button onClick={onSave} disabled={busy}
        className="border border-zinc-800 hover:border-zinc-600 text-zinc-300 px-3 py-1.5 text-xs font-mono uppercase tracking-widest disabled:opacity-50">
        Zapisz tempo
      </button>
    </div>
  );
}

function ChatHeatmap() {
  const [loading, setLoading] = useState(true);
  const [grid, setGrid] = useState<number[][]>([]);
  const [peak, setPeak] = useState(0);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/analytics");
        const d = await res.json();
        if (!cancelled && res.ok) {
          setGrid(d.grid ?? []);
          setPeak(d.peak ?? 0);
          setTotal(d.total ?? 0);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const days = ["Nd", "Pn", "Wt", "Śr", "Cz", "Pt", "So"];
  const cellColor = (v: number) =>
    v <= 0 || peak <= 0 ? "rgba(255,255,255,0.04)" : `rgba(229,9,20,${(0.15 + (v / peak) * 0.85).toFixed(3)})`;

  return (
    <SectionCard title="Analityka — heatmapa czatu" icon={TrendingUp}>
      <p className="text-zinc-500 text-xs mb-3">
        Kiedy czat jest najbardziej aktywny (dzień tygodnia × godzina, czas Europe/Warsaw). Zliczane z aktywności na Twitch + Kick + YouTube (1/min/widz).
      </p>
      {loading ? (
        <div className="text-xs text-zinc-500 flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin" /> Ładowanie…</div>
      ) : total === 0 ? (
        <div className="text-xs text-zinc-500 text-center py-4 border border-zinc-900 bg-black/20">
          Brak danych — pojawią się, gdy ktoś napisze na czacie podczas streamu.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <div className="inline-block">
            <div className="flex items-center gap-[2px] mb-[2px] ml-7">
              {Array.from({ length: 24 }, (_, h) => (
                <div key={h} className="w-[14px] text-center text-[8px] text-zinc-600 tabular-nums">{h % 6 === 0 ? h : ""}</div>
              ))}
            </div>
            {grid.map((row, d) => (
              <div key={d} className="flex items-center gap-[2px] mb-[2px]">
                <div className="w-6 text-[9px] font-mono text-zinc-500 shrink-0">{days[d]}</div>
                {row.map((v, h) => (
                  <div key={h} title={`${days[d]} ${h}:00 — ${v}`} className="w-[14px] h-[14px] rounded-[2px]" style={{ background: cellColor(v) }} />
                ))}
              </div>
            ))}
          </div>
          <div className="text-[10px] text-zinc-600 mt-2">
            Łącznie {total.toLocaleString("pl-PL")} aktywnych chatter-minut · szczyt {peak}/slot
          </div>
        </div>
      )}
    </SectionCard>
  );
}

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
        Cele wyświetlane na OBS overlay. Auto-inkrementowane przez Twitch EventSub (subs/gifts/cheers), Streamlabs (donacje PLN), YouTube super chats + members.
      </p>

      <div className="mb-4">
        <OverlayPreview path="/overlay/goals" note="Paski celów pojawiają się w lewym-dolnym rogu; hype train (gdy aktywny) u góry.">
          <GoalBar goal={{ id: "preview1", type: "subs", label: "500 subów = nowy setup!", current: 327, target: 500, color: null, completedAt: null }} accent="#E50914" />
          <GoalBar goal={{ id: "preview2", type: "donations_pln", label: "Cel miesiąca", current: 1500, target: 1500, color: "#10b981", completedAt: new Date().toISOString() }} accent="#E50914" />
        </OverlayPreview>
      </div>

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
                    <div className="flex-1 h-1.5 bg-zinc-900 rounded-sm overflow-hidden">
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
              className="w-full border border-zinc-700 bg-black/40 px-2 py-1.5 text-xs text-white outline-hidden focus:border-red-600"
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
              className="w-full border border-zinc-700 bg-black/40 px-2 py-1.5 text-xs text-white outline-hidden focus:border-red-600"
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
              className="w-full border border-zinc-700 bg-black/40 px-2 py-1.5 text-xs text-white outline-hidden focus:border-red-600"
            />
          </div>
          <div>
            <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-0.5">Target</label>
            <input
              type="number"
              min={1}
              value={newTarget}
              onChange={(e) => setNewTarget(e.target.value)}
              className="w-full border border-zinc-700 bg-black/40 px-2 py-1.5 text-xs text-white font-mono outline-hidden focus:border-red-600"
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
                className="flex-1 border border-zinc-700 bg-black/40 px-2 py-1.5 text-xs text-white font-mono outline-hidden focus:border-red-600"
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
              className="w-full border border-zinc-700 bg-black/40 px-2 py-1.5 text-sm text-white outline-hidden focus:border-red-600"
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
                    className="flex-1 border border-zinc-700 bg-black/40 px-2 py-1.5 text-xs text-white outline-hidden focus:border-red-600"
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
                className="w-24 border border-zinc-700 bg-black/40 px-2 py-1.5 text-xs text-white font-mono outline-hidden focus:border-red-600"
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

// ============== KICK EVENTS ==============

const KICK_EVENT_LABEL: Record<string, string> = {
  "channel.subscription.new":      "Nowy sub",
  "channel.subscription.renewal":  "Odnowienie subu",
  "channel.subscription.gifts":    "Gifted suby",
  "channel.followed":              "Follow",
  "livestream.status.updated":     "Live status",
};

type KickData = {
  streamerConnected: boolean;
  broadcasterLogin: string | null;
  broadcasterId: string | null;
  connectedAt: string | null;
  subscriptions: Array<{
    id: string;
    type: string;
    lastSeenAt: string | null;
    createdAt: string;
  }>;
  remote: Array<{ id: string; event: string; version: number; method: string; created_at: string; updated_at: string }>;
  recentEvents: Array<{
    id: string;
    type: string;
    userId: string | null;
    tokensGranted: number | null;
    receivedAt: string;
  }>;
};

function KickEventsManager({
  onToast, onSuccess, pending,
}: {
  onToast: (k: "ok" | "err", m: string) => void;
  onSuccess: () => void;
  pending: boolean;
}) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<KickData | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/kick-events");
      const json = await res.json();
      if (res.ok) setData(json);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function setup() {
    if (!confirm("Utworzyć webhook subscriptions dla wszystkich Kick eventów (subs/gifts/follows/live status)?")) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/kick-events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "setup" }),
      });
      const result = await res.json();
      // Always log the full response so we can see exactly what Kick said
      console.log("[kick setup] response:", result);
      if (!res.ok || result.error) {
        // Error case (incl. HTTP 200 but Kick rejected / created nothing)
        onToast("err", result.error ?? "Błąd setupu");
      } else if (Array.isArray(result.results) && result.results.length > 0) {
        const ok = result.results.filter((r: { ok: boolean }) => r.ok).length;
        const fail = result.results.length - ok;
        onToast(fail > 0 ? "err" : "ok", `Setup: ok=${ok}, fail=${fail}`);
      } else {
        onToast("ok", result.message ?? "Setup zakończony");
      }
      await load();
      onSuccess();
    } finally {
      setBusy(false);
    }
  }

  async function deleteSub(id: string, type: string) {
    if (!confirm(`Usunąć subskrypcję ${type}?`)) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/kick-events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", id }),
      });
      if (res.ok) { onToast("ok", "Usunięto"); await load(); }
      else { const r = await res.json(); onToast("err", r.error ?? "Błąd"); }
    } finally {
      setBusy(false);
    }
  }

  return (
    <SectionCard title="Kick — webhook events (subs/gifts/follows)" icon={Radio}>
      <p className="text-zinc-500 text-xs mb-3">
        Auto-tracking subskrypcji, gifted subów, followsów i live status na Kicku. Wymaga jednorazowej autoryzacji streamera ze scope&apos;ami: <code className="text-green-400">channel:read</code>, <code className="text-green-400">events:subscribe</code>.
      </p>

      {/* Streamer auth status */}
      <div className="border border-zinc-800 bg-black/30 p-3 mb-3">
        {loading ? (
          <div className="text-xs text-zinc-500 flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin" /> Ładowanie…</div>
        ) : data?.streamerConnected ? (
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold text-green-300 mb-0.5">
                ● Streamer autoryzowany: @{data.broadcasterLogin}
              </div>
              <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest truncate">
                Broadcaster ID: {data.broadcasterId} · od {data.connectedAt && new Date(data.connectedAt).toLocaleString("pl-PL", { dateStyle: "short" })}
              </div>
            </div>
            <button
              onClick={setup}
              disabled={busy || pending}
              className="px-3 py-1.5 bg-green-700 hover:bg-green-600 text-white text-[10px] font-bold tracking-widest uppercase disabled:opacity-50 flex items-center gap-1.5"
            >
              {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
              {data.subscriptions.length === 0 ? "Utwórz subskrypcje" : "Dodaj brakujące"}
            </button>
            <a
              href="/api/admin/kick-streamer-auth"
              className="px-3 py-1.5 border border-zinc-700 hover:border-zinc-500 text-zinc-300 text-[10px] font-bold tracking-widest uppercase"
            >
              Re-autoryzuj
            </a>
          </div>
        ) : (
          <div className="text-center py-2">
            <p className="text-zinc-400 text-sm mb-3">
              Streamer Kick jeszcze nie autoryzował. Kliknij i zaloguj jako <strong>Gh0s77tt</strong> na Kicku żeby nadać Ghost Empire prawo subskrypcji eventów.
            </p>
            <a
              href="/api/admin/kick-streamer-auth"
              className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-500 text-white text-xs font-bold tracking-widest uppercase"
            >
              <Radio className="w-3.5 h-3.5" />
              Autoryzuj Kick
            </a>
          </div>
        )}
      </div>

      {/* Subscriptions list */}
      {data?.streamerConnected && (
        <>
          <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-2">
            Subskrypcje Kick ({data.subscriptions.length})
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
                    {KICK_EVENT_LABEL[s.type] ?? s.type}
                  </span>
                  <div className="flex-1 min-w-0 text-[10px] font-mono text-zinc-500 truncate">
                    {s.lastSeenAt ? `Last: ${new Date(s.lastSeenAt).toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "short" })}` : "Brak eventów"}
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
                    <span className="text-zinc-500 uppercase tracking-widest w-32 truncate">
                      {KICK_EVENT_LABEL[e.type] ?? e.type}
                    </span>
                    {e.tokensGranted ? (
                      <span className="text-green-400">+{e.tokensGranted.toLocaleString("pl-PL")} GT</span>
                    ) : (
                      <span className="text-zinc-600">(unmatched / no reward)</span>
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

// ============== BATTLE PASS / SEASONS ==============

type AdminSeason = {
  id: string;
  number: number;
  name: string;
  description: string | null;
  startsAt: string;
  endsAt: string;
  totalTiers: number;
  xpPerTier: number;
  active: boolean;
  participants: number;
  rewards: Array<{ id: string; tier: number; premium: boolean; type: string; label: string; value: string; icon: string | null }>;
};

function SeasonsManager({
  onToast, onSuccess, pending,
}: {
  onToast: (k: "ok" | "err", m: string) => void;
  onSuccess: () => void;
  pending: boolean;
}) {
  const [loading, setLoading] = useState(true);
  const [seasons, setSeasons] = useState<AdminSeason[]>([]);
  const [rewardTypes, setRewardTypes] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const [rTier, setRTier] = useState("1");
  const [rType, setRType] = useState("tokens");
  const [rLabel, setRLabel] = useState("");
  const [rValue, setRValue] = useState("");
  const [rIcon, setRIcon] = useState("");
  const [rPremium, setRPremium] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/seasons");
      const data = await res.json();
      if (res.ok) {
        setSeasons(data.seasons ?? []);
        setRewardTypes(data.rewardTypes ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function call(payload: Record<string, unknown>): Promise<boolean> {
    const res = await fetch("/api/admin/seasons", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) { onToast("err", data.error ?? "Błąd"); return false; }
    return true;
  }

  async function ensureCurrent() {
    setBusy("ensure");
    if (await call({ action: "ensure_current" })) { onToast("ok", "Bieżący sezon gotowy"); await load(); onSuccess(); }
    setBusy(null);
  }

  async function addReward(seasonId: string) {
    const tier = parseInt(rTier, 10);
    if (!tier || !rLabel.trim() || !rValue.trim()) { onToast("err", "Tier + label + value wymagane"); return; }
    setBusy(`add-${seasonId}`);
    const ok = await call({
      action: "add_reward",
      seasonId,
      tier,
      type: rType,
      label: rLabel.trim(),
      value: rValue.trim(),
      icon: rIcon || undefined,
      premium: rPremium,
    });
    if (ok) {
      setRLabel(""); setRValue(""); setRIcon("");
      onToast("ok", "Nagroda dodana");
      await load();
    }
    setBusy(null);
  }

  async function deleteReward(rewardId: string) {
    if (!confirm("Usunąć nagrodę?")) return;
    setBusy(rewardId);
    if (await call({ action: "delete_reward", rewardId })) { await load(); }
    setBusy(null);
  }

  const activeSeason = seasons.find((s) => s.active);

  return (
    <SectionCard title="Battle Pass / Sezony" icon={Ticket}>
      <p className="text-zinc-500 text-xs mb-3">
        Sezony rolują się miesięcznie (auto przy pierwszym XP eventcie miesiąca). Widzowie zbierają XP za aktywność, odbierają nagrody na tierach. Strona widzów: <code className="text-zinc-300">/seasons</code>.
      </p>

      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <button
          onClick={ensureCurrent}
          disabled={busy === "ensure" || pending}
          className="px-3 py-1.5 bg-red-700 hover:bg-red-600 text-white text-[10px] font-bold tracking-widest uppercase disabled:opacity-50 flex items-center gap-1.5"
        >
          {busy === "ensure" ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
          Utwórz / odśwież bieżący sezon
        </button>
        <span className="text-[10px] text-zinc-500">Tworzy sezon dla bieżącego miesiąca z domyślnymi nagrodami.</span>
      </div>

      {loading ? (
        <div className="text-xs text-zinc-500 flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin" /> Ładowanie…</div>
      ) : seasons.length === 0 ? (
        <div className="text-xs text-zinc-500 text-center py-4 border border-zinc-900 bg-black/20">
          Brak sezonów. Kliknij &quot;Utwórz bieżący sezon&quot;.
        </div>
      ) : (
        <div className="space-y-4">
          {activeSeason && (
            <div className="border border-green-900 bg-green-950/10 p-3">
              <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                <div>
                  <span className="text-[9px] font-mono uppercase tracking-widest px-1.5 py-0.5 border border-green-700 bg-green-950/40 text-green-300 mr-2">AKTYWNY</span>
                  <span className="text-white font-bold">{activeSeason.name}</span>
                </div>
                <div className="text-[10px] font-mono text-zinc-500">
                  {activeSeason.participants} graczy · {activeSeason.totalTiers} tierów · {fmt(activeSeason.xpPerTier)} XP/tier · do {new Date(activeSeason.endsAt).toLocaleDateString("pl-PL")}
                </div>
              </div>

              <div className="space-y-1 mb-3">
                {activeSeason.rewards.length === 0 ? (
                  <div className="text-[11px] text-zinc-600 italic">Brak nagród.</div>
                ) : (
                  activeSeason.rewards.map((r) => (
                    <div key={r.id} className="flex items-center gap-2 text-[11px] border border-zinc-800 bg-black/30 px-2 py-1">
                      <span className="font-mono text-zinc-500 w-12">T{r.tier}</span>
                      <span>{r.icon ?? "🎁"}</span>
                      <span className="text-white flex-1 truncate">{r.label}</span>
                      {r.premium && <span className="text-[8px] font-mono uppercase px-1 border border-yellow-700 text-yellow-300">PREM</span>}
                      <span className="font-mono text-zinc-600">{r.type}={r.value}</span>
                      <button
                        onClick={() => deleteReward(r.id)}
                        disabled={busy === r.id}
                        className="text-zinc-500 hover:text-red-400"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))
                )}
              </div>

              <div className="border-t border-zinc-800 pt-2">
                <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-1">Dodaj nagrodę</div>
                <div className="grid grid-cols-2 sm:grid-cols-6 gap-1.5 items-end">
                  <div>
                    <label className="text-[9px] text-zinc-500 block">Tier</label>
                    <input type="number" min={1} max={activeSeason.totalTiers} value={rTier} onChange={(e) => setRTier(e.target.value)}
                      className="w-full border border-zinc-700 bg-black/40 px-1.5 py-1 text-xs text-white font-mono outline-hidden focus:border-red-600" />
                  </div>
                  <div>
                    <label className="text-[9px] text-zinc-500 block">Typ</label>
                    <select value={rType} onChange={(e) => setRType(e.target.value)}
                      className="w-full border border-zinc-700 bg-black/40 px-1.5 py-1 text-xs text-white outline-hidden focus:border-red-600">
                      {rewardTypes.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className="text-[9px] text-zinc-500 block">Label</label>
                    <input value={rLabel} onChange={(e) => setRLabel(e.target.value)} placeholder="np. 5000 Ghost Tokens"
                      className="w-full border border-zinc-700 bg-black/40 px-1.5 py-1 text-xs text-white outline-hidden focus:border-red-600" />
                  </div>
                  <div>
                    <label className="text-[9px] text-zinc-500 block">Value</label>
                    <input value={rValue} onChange={(e) => setRValue(e.target.value)}
                      placeholder={rType === "tokens" ? "5000" : rType === "code" ? "KOD-XYZ-123" : rType === "item" ? "opis odbioru" : "wartość"}
                      className="w-full border border-zinc-700 bg-black/40 px-1.5 py-1 text-xs text-white font-mono outline-hidden focus:border-red-600" />
                  </div>
                  <div>
                    <label className="text-[9px] text-zinc-500 block">Ikona</label>
                    <input value={rIcon} onChange={(e) => setRIcon(e.target.value)} placeholder="👻"
                      className="w-full border border-zinc-700 bg-black/40 px-1.5 py-1 text-xs text-white outline-hidden focus:border-red-600" />
                  </div>
                </div>
                <p className="text-[9px] text-zinc-600 mt-1 leading-relaxed">
                  <strong className="text-zinc-400">tokens</strong>: ilość GT w „value" · <strong className="text-zinc-400">code</strong>: kod pokazywany graczowi po odebraniu · <strong className="text-zinc-400">item</strong>: nagroda rzeczowa, odbiór przez ticket (w „value" wpisz szczegóły) · reszta = kosmetyka.
                </p>
                <div className="flex items-center gap-3 mt-2">
                  <label className="flex items-center gap-1.5 text-[10px] text-zinc-400 cursor-pointer">
                    <input type="checkbox" checked={rPremium} onChange={(e) => setRPremium(e.target.checked)} className="accent-yellow-600" />
                    Premium track
                  </label>
                  <button
                    onClick={() => addReward(activeSeason.id)}
                    disabled={busy === `add-${activeSeason.id}` || pending}
                    className="ml-auto px-3 py-1 bg-red-700 hover:bg-red-600 text-white text-[10px] font-bold tracking-widest uppercase disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {busy === `add-${activeSeason.id}` ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                    Dodaj
                  </button>
                </div>
              </div>
            </div>
          )}

          {seasons.filter((s) => !s.active).length > 0 && (
            <div>
              <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-2">Poprzednie sezony</div>
              <div className="space-y-1">
                {seasons.filter((s) => !s.active).map((s) => (
                  <div key={s.id} className="flex items-center gap-2 text-[11px] border border-zinc-900 bg-black/20 px-2 py-1.5">
                    <span className="text-white">{s.name}</span>
                    <span className="text-zinc-600 font-mono ml-auto">{s.participants} graczy · {s.rewards.length} nagród</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </SectionCard>
  );
}

