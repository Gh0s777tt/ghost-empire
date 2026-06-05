"use client";
// src/components/admin/AdminClient.tsx
import { useState, useTransition, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  ShieldCheck, Coins, Gift, Calendar, Package, Plus, X, Loader2, Check,
  Users, TrendingUp, Dice5, Heart, UserCog, History, Award,
  ShoppingBag, Ban, Bot, CalendarDays, Zap,
  LayoutDashboard, LayoutGrid, Bell, Tv, Menu, GitMerge, Radio, MonitorPlay,
  Target, RefreshCw, Ticket, MessageSquare, Clock, HelpCircle, UserPlus, Music, Hourglass, BarChart3,
} from "lucide-react";
import { ErrorState } from "@/components/EmptyState";
import { fmt, formatDate, cn } from "@/lib/utils";
import { OverlayPreview } from "@/components/admin/OverlayPreview";
import dynamic from "next/dynamic";
import { SectionCard, FieldInput } from "./shared";
import type { AuditEntry, BotConfigData, ScheduleSlot, TwitchEventSubData, StreamlabsConnectionData, UnmatchedDonation, ShopItemRow, CodeRow, CodeConfig, EventRow, Drop, PendingOrder, StreamAlertsData } from "./types";

// Heavy, rarely-first-viewed admin sections split into their own lazy chunks
// (keeps the initial /admin client bundle smaller). See components/admin/sections/.
const SectionLoading = () => <div className="text-zinc-600 text-sm">Ładowanie…</div>;
const AnalyticsSection = dynamic(() => import("./sections/Analytics").then((m) => m.AnalyticsSection), { ssr: false, loading: SectionLoading });
const AuditLogSection = dynamic(() => import("./sections/AuditLog").then((m) => m.AuditLogSection), { ssr: false, loading: SectionLoading });
const PollsManager = dynamic(() => import("./sections/Polls").then((m) => m.PollsManager), { ssr: false, loading: SectionLoading });
const ModerationManager = dynamic(() => import("./sections/Moderation").then((m) => m.ModerationManager), { ssr: false, loading: SectionLoading });
const WidgetsLibrary = dynamic(() => import("./sections/Widgets").then((m) => m.WidgetsLibrary), { ssr: false, loading: SectionLoading });
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
const BotConfigCard = dynamic(() => import("./sections/BotConfig").then((m) => m.BotConfigCard), { ssr: false, loading: SectionLoading });
const ScheduleManager = dynamic(() => import("./sections/Schedule").then((m) => m.ScheduleManager), { ssr: false, loading: SectionLoading });
const TwitchEventSubManager = dynamic(() => import("./sections/TwitchEventSub").then((m) => m.TwitchEventSubManager), { ssr: false, loading: SectionLoading });
const StreamlabsManager = dynamic(() => import("./sections/Streamlabs").then((m) => m.StreamlabsManager), { ssr: false, loading: SectionLoading });
const UserRolesCard = dynamic(() => import("./sections/UserRoles").then((m) => m.UserRolesCard), { ssr: false, loading: SectionLoading });
const ConnectionRolesCard = dynamic(() => import("./sections/UserRoles").then((m) => m.ConnectionRolesCard), { ssr: false, loading: SectionLoading });
const ShopManager = dynamic(() => import("./sections/Shop").then((m) => m.ShopManager), { ssr: false, loading: SectionLoading });
const CodeDropsCard = dynamic(() => import("./sections/CodeDrops").then((m) => m.CodeDropsCard), { ssr: false, loading: SectionLoading });
const HolidayEventsCard = dynamic(() => import("./sections/Events").then((m) => m.HolidayEventsCard), { ssr: false, loading: SectionLoading });
const CreateEventCard = dynamic(() => import("./sections/Events").then((m) => m.CreateEventCard), { ssr: false, loading: SectionLoading });
const EventsManager = dynamic(() => import("./sections/Events").then((m) => m.EventsManager), { ssr: false, loading: SectionLoading });
const ActiveDropsList = dynamic(() => import("./sections/ActiveDrops").then((m) => m.ActiveDropsList), { ssr: false, loading: SectionLoading });
const PendingOrdersList = dynamic(() => import("./sections/PendingOrders").then((m) => m.PendingOrdersList), { ssr: false, loading: SectionLoading });
const StreamAlertsManager = dynamic(() => import("./sections/StreamAlerts").then((m) => m.StreamAlertsManager), { ssr: false, loading: SectionLoading });

type Stats = {
  totalUsers: number;
  totalTokensInCirculation: number;
  totalEverEarned: number;
  eventsActive: number;
  ordersPending: number;
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
    | "schedule" | "bot" | "donations" | "twitch" | "kick" | "youtube" | "chat" | "moderation" | "timers" | "faq" | "welcome" | "songs" | "widgets" | "alerts" | "goals" | "subathon" | "predictions" | "seasons" | "achievements" | "polls" | "analytics" | "audit";

  const SECTIONS: Array<{
    id: SectionId;
    label: string;
    icon: typeof Users;
    group: string;
    permission: () => boolean;
  }> = [
    { id: "dashboard", label: "Dashboard",   icon: LayoutDashboard, group: "main",       permission: () => true },
    { id: "analytics", label: "Analityka",    icon: TrendingUp,     group: "main",       permission: () => isAdmin },

    { id: "users",     label: "Użytkownicy", icon: UserCog,         group: "moderation", permission: () => can("grant_tokens") || isAdmin || can("mark_subs") },
    { id: "merge",     label: "Merge duplikatów", icon: GitMerge,   group: "moderation", permission: () => isAdmin },
    { id: "moderation", label: "Moderacja",    icon: ShieldCheck,   group: "moderation", permission: () => isAdmin },
    { id: "audit",     label: "Audit log",   icon: History,         group: "moderation", permission: () => can("view_audit") },

    { id: "twitch",    label: "Twitch",      icon: Tv,              group: "platforms",  permission: () => isAdmin },
    { id: "kick",      label: "Kick",        icon: Radio,           group: "platforms",  permission: () => isAdmin },
    { id: "youtube",   label: "YouTube",     icon: MonitorPlay,     group: "platforms",  permission: () => isAdmin },

    { id: "bot",       label: "Bot Discord", icon: Bot,             group: "bot",        permission: () => can("manage_shop") },
    { id: "chat",      label: "Komendy czatu", icon: MessageSquare, group: "bot",        permission: () => isAdmin },
    { id: "timers",    label: "Timery",        icon: Clock,         group: "bot",        permission: () => isAdmin },
    { id: "faq",       label: "FAQ / auto",    icon: HelpCircle,    group: "bot",        permission: () => isAdmin },
    { id: "welcome",   label: "Powitania",     icon: UserPlus,      group: "bot",        permission: () => isAdmin },
    { id: "songs",     label: "Song requests", icon: Music,         group: "bot",        permission: () => isAdmin },

    { id: "widgets",   label: "Widgety (OBS)", icon: LayoutGrid,    group: "overlays",   permission: () => isAdmin },
    { id: "alerts",    label: "Stream Alerts", icon: Bell,          group: "overlays",   permission: () => isAdmin },
    { id: "goals",     label: "Stream Goals", icon: Target,         group: "overlays",   permission: () => isAdmin },
    { id: "subathon",  label: "Subathon",      icon: Hourglass,     group: "overlays",   permission: () => isAdmin },

    { id: "shop",      label: "Sklep",       icon: ShoppingBag,     group: "economy",    permission: () => can("manage_shop") || can("deliver_orders") },
    { id: "drops",     label: "Drops",       icon: Gift,            group: "economy",    permission: () => can("create_drops") },
    { id: "seasons",   label: "Battle Pass", icon: Ticket,          group: "economy",    permission: () => isAdmin },
    { id: "donations", label: "Donacje",     icon: Heart,           group: "economy",    permission: () => isAdmin },

    { id: "events",    label: "Eventy",      icon: Calendar,        group: "community",  permission: () => can("create_events") || can("edit_events") || can("draw_events") },
    { id: "predictions", label: "Predictions", icon: Dice5,         group: "community",  permission: () => can("create_events") },
    { id: "polls",     label: "Ankiety",     icon: BarChart3,       group: "community",  permission: () => isAdmin },
    { id: "achievements", label: "Osiągnięcia", icon: Award,        group: "community",  permission: () => isAdmin },
    { id: "schedule",  label: "Harmonogram", icon: CalendarDays,    group: "community",  permission: () => can("manage_shop") },
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

          {activeSection === "moderation" && isAdmin && (
            <ModerationManager {...sharedProps} />
          )}

          {activeSection === "widgets" && isAdmin && (
            <WidgetsLibrary {...sharedProps} />
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

// Sidebar groups (order + labels). Sections carry a `group` key matching these.
const NAV_GROUPS: Array<{ key: string; label: string }> = [
  { key: "main",       label: "Pulpit" },
  { key: "moderation", label: "Moderacja" },
  { key: "platforms",  label: "Platformy" },
  { key: "bot",        label: "Bot & czat" },
  { key: "overlays",   label: "Overlaye OBS" },
  { key: "economy",    label: "Ekonomia" },
  { key: "community",  label: "Eventy & społeczność" },
];

function AdminNav<T extends string>({
  sections, active, onSelect,
}: {
  sections: Array<{ id: T; label: string; icon: typeof Users; group: string }>;
  active: T;
  onSelect: (id: T) => void;
}) {
  const activeGroup = sections.find((s) => s.id === active)?.group ?? "main";
  // Collapsed by default except the group holding the active section → no endless scroll.
  const [open, setOpen] = useState<Record<string, boolean>>({ [activeGroup]: true });

  useEffect(() => {
    setOpen((prev) => (prev[activeGroup] ? prev : { ...prev, [activeGroup]: true }));
  }, [activeGroup]);

  return (
    <aside className="lg:w-56 lg:shrink-0">
      <nav
        className={cn(
          "flex flex-col gap-0.5 lg:sticky lg:top-4 max-h-[80vh] overflow-y-auto",
          "border border-zinc-800 bg-zinc-950/70 backdrop-blur-xs p-2",
        )}
        style={{
          clipPath:
            "polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 10px 100%, 0 calc(100% - 10px))",
        }}
      >
        {NAV_GROUPS.map((g) => {
          const items = sections.filter((s) => s.group === g.key);
          if (items.length === 0) return null;
          const isOpen = open[g.key] ?? false;
          const hasActive = items.some((s) => s.id === active);
          return (
            <div key={g.key}>
              <button
                type="button"
                onClick={() => setOpen((prev) => ({ ...prev, [g.key]: !prev[g.key] }))}
                className={cn(
                  "w-full flex items-center justify-between gap-2 px-2 py-1.5 text-[9px] font-mono uppercase tracking-widest transition-colors",
                  hasActive ? "text-red-300" : "text-zinc-500 hover:text-zinc-300",
                )}
                aria-expanded={isOpen}
              >
                <span className="flex items-center gap-1.5">
                  {g.label}
                  {!isOpen && hasActive && <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" />}
                </span>
                <span className="flex items-center gap-1.5 text-zinc-600">
                  <span>{items.length}</span>
                  <span>{isOpen ? "▾" : "▸"}</span>
                </span>
              </button>
              {isOpen && (
                <div className="flex flex-col gap-0.5 mb-1">
                  {items.map((s) => {
                    const Icon = s.icon;
                    const isActive = s.id === active;
                    return (
                      <button
                        key={s.id}
                        onClick={() => onSelect(s.id)}
                        className={cn(
                          "flex items-center gap-2 pl-3.5 pr-3 py-1.5 text-[11px] font-mono uppercase tracking-widest transition-all border-l-2",
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
                </div>
              )}
            </div>
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

// All admin sections beyond the shell above (nav / dashboard / lazy-loader)
// live in ./sections/*.tsx, lazily imported at the top of this file.
