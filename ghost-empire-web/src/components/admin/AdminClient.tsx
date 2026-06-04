"use client";
// src/components/admin/AdminClient.tsx
import { useState, useTransition, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  ShieldCheck, Coins, Gift, Calendar, Package, Plus, X, Loader2, Check,
  Users, TrendingUp, Trash2, Copy, Dice5, Heart, UserCog, History, Award,
  ShoppingBag, Eye, EyeOff, Ban, Bot, CalendarDays, Zap,
  LayoutDashboard, Bell, Tv, Menu, GitMerge, Radio, MonitorPlay,
  Target, RefreshCw, Ticket, MessageSquare, Clock, HelpCircle, UserPlus, Music, Hourglass, BarChart3,
} from "lucide-react";
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
import { OverlayPreview } from "@/components/admin/OverlayPreview";
import dynamic from "next/dynamic";
import { SectionCard, FieldInput } from "./shared";
import type { AuditEntry, BotConfigData, ScheduleSlot, TwitchEventSubData, StreamlabsConnectionData, UnmatchedDonation, ShopItemRow, CodeRow, CodeConfig, EventRow } from "./types";

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

// ============== EVENT MANAGER (list + edit + activate/deactivate) ==============

// Unified events manager — one list of ALL events (active first, deactivated
// dimmed) with every per-event action inline: draw winners (draw_events),
// toggle active + edit (edit_events). Replaces the old split between a separate
// "Aktywne eventy" (draw/deactivate) and "Edycja eventów" (toggle/edit) card.
// ============== TWITCH EVENTSUB ==============

// ============== STREAMLABS DONATIONS ==============

// ============== AUDIT LOG VIEWER ==============

// ============== MOD PERMISSIONS PICKER ==============

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



