"use client";
// src/components/admin/AdminClient.tsx
import { useState, useTransition, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  ShieldCheck, Coins, Gift, Calendar, Package, Plus, X, Loader2, Check,
  Users, TrendingUp, Trash2, Copy, Dice5, Crown, Heart, UserCog, History, Award,
  ShoppingBag, Pencil, Eye, EyeOff, Ban, Bot, CalendarDays, Zap, Link as LinkIcon,
  LayoutDashboard, Bell, Tv, Menu, GitMerge, Radio, MonitorPlay,
  Target, RefreshCw, Ticket, MessageSquare, Clock, HelpCircle, UserPlus, Music, Hourglass, BarChart3,
} from "lucide-react";
import { MOD_PERMISSIONS, PERMISSION_GROUPS } from "@/lib/permissions";
import { ErrorState } from "@/components/EmptyState";
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
import dynamic from "next/dynamic";
import { SectionCard, FieldInput, FieldTextarea } from "./shared";
import type { AuditEntry } from "./types";

// Heavy, rarely-first-viewed admin sections split into their own lazy chunks
// (keeps the initial /admin client bundle smaller). See components/admin/sections/.
const SectionLoading = () => <div className="text-zinc-600 text-sm">Ładowanie…</div>;
const AnalyticsSection = dynamic(() => import("./sections/Analytics").then((m) => m.AnalyticsSection), { ssr: false, loading: SectionLoading });
const AuditLogSection = dynamic(() => import("./sections/AuditLog").then((m) => m.AuditLogSection), { ssr: false, loading: SectionLoading });
const PollsManager = dynamic(() => import("./sections/Polls").then((m) => m.PollsManager), { ssr: false, loading: SectionLoading });
const AchievementsManager = dynamic(() => import("./sections/Achievements").then((m) => m.AchievementsManager), { ssr: false, loading: SectionLoading });
const PredictionsManager = dynamic(() => import("./sections/Predictions").then((m) => m.PredictionsManager), { ssr: false, loading: SectionLoading });
const WelcomeManager = dynamic(() => import("./sections/Welcome").then((m) => m.WelcomeManager), { ssr: false, loading: SectionLoading });
const FaqManager = dynamic(() => import("./sections/Faq").then((m) => m.FaqManager), { ssr: false, loading: SectionLoading });
const ChatTimersManager = dynamic(() => import("./sections/ChatTimers").then((m) => m.ChatTimersManager), { ssr: false, loading: SectionLoading });
const ChatCommandsManager = dynamic(() => import("./sections/ChatCommands").then((m) => m.ChatCommandsManager), { ssr: false, loading: SectionLoading });
const SongQueueManager = dynamic(() => import("./sections/SongQueue").then((m) => m.SongQueueManager), { ssr: false, loading: SectionLoading });
const SubathonManager = dynamic(() => import("./sections/Subathon").then((m) => m.SubathonManager), { ssr: false, loading: SectionLoading });
const GrantTokensCard = dynamic(() => import("./sections/GrantTokens").then((m) => m.GrantTokensCard), { ssr: false, loading: SectionLoading });
const CreateDropCard = dynamic(() => import("./sections/CreateDrop").then((m) => m.CreateDropCard), { ssr: false, loading: SectionLoading });
const DatabaseResetCard = dynamic(() => import("./sections/DatabaseReset").then((m) => m.DatabaseResetCard), { ssr: false, loading: SectionLoading });
const CustomAlertsCard = dynamic(() => import("./sections/CustomAlerts").then((m) => m.CustomAlertsCard), { ssr: false, loading: SectionLoading });
const ChatOverlayCard = dynamic(() => import("./sections/ChatOverlay").then((m) => m.ChatOverlayCard), { ssr: false, loading: SectionLoading });
const StreamGoalsManager = dynamic(() => import("./sections/StreamGoals").then((m) => m.StreamGoalsManager), { ssr: false, loading: SectionLoading });
const KickEventsManager = dynamic(() => import("./sections/KickEvents").then((m) => m.KickEventsManager), { ssr: false, loading: SectionLoading });
const YouTubeLiveManager = dynamic(() => import("./sections/YouTubeLive").then((m) => m.YouTubeLiveManager), { ssr: false, loading: SectionLoading });
const SeasonsManager = dynamic(() => import("./sections/Seasons").then((m) => m.SeasonsManager), { ssr: false, loading: SectionLoading });
const MergeUsersSection = dynamic(() => import("./sections/MergeUsers").then((m) => m.MergeUsersSection), { ssr: false, loading: SectionLoading });

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
  entriesCount: number;
  ticketsCount: number;
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
              {(can("edit_events") || can("draw_events")) && (
                <LazySection<{ allEvents: EventRow[] }> s="events">
                  {(d) => (
                    <EventsManager
                      events={d.allEvents}
                      canEdit={can("edit_events")}
                      canDraw={can("draw_events")}
                      {...sharedProps}
                    />
                  )}
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

          {activeSection === "analytics" && isAdmin && <AnalyticsSection />}

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
  const [reloadKey, setReloadKey] = useState(0);

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
  }, [s, reloadKey]);

  if (error) {
    return <ErrorState message={`Sekcja: ${error}`} onRetry={() => setReloadKey((k) => k + 1)} />;
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

// ============== GRANT TOKENS ==============

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
        role="dialog"
        aria-modal="true"
        aria-label="Edytor itema sklepu"
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

// Unified events manager — one list of ALL events (active first, deactivated
// dimmed) with every per-event action inline: draw winners (draw_events),
// toggle active + edit (edit_events). Replaces the old split between a separate
// "Aktywne eventy" (draw/deactivate) and "Edycja eventów" (toggle/edit) card.
function EventsManager({
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

// ============== CUSTOM ALERTS (admin-defined, manually fired) ==============

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



