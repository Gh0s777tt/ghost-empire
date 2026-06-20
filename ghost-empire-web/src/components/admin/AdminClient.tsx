"use client";
// src/components/admin/AdminClient.tsx
import { useState, useTransition, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  ShieldCheck, Coins, Gift, Calendar, Package, Plus, X, Loader2, Check,
  Users, TrendingUp, Dice5, Heart, UserCog, History, Award,
  ShoppingBag, Ban, Bot, CalendarDays, Zap,
  LayoutDashboard, LayoutGrid, Bell, Tv, Menu, GitMerge, Radio, MonitorPlay,
  Target, RefreshCw, Ticket, MessageSquare, Clock, HelpCircle, UserPlus, Music, Hourglass, BarChart3, Plug, Search, Disc3, Webhook, Gamepad2, Building2, Swords, KeyRound, Volume2, Wallet, Sparkles, Clapperboard, Brain, Megaphone, Handshake, Layers,
} from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { ErrorState } from "@/components/EmptyState";
import { fmt, formatDate, cn } from "@/lib/utils";
import { OverlayPreview } from "@/components/admin/OverlayPreview";
import { useTenantBranding } from "@/components/TenantBranding";
import { CommandPalette, openCommandPalette } from "./CommandPalette";
import { SetupStatusCard } from "./SetupStatusCard";
import { AdminAssistant } from "./AdminAssistant";
import dynamic from "next/dynamic";
import { SectionCard, FieldInput } from "./shared";
import type { AuditEntry, BotConfigData, ScheduleSlot, TwitchEventSubData, StreamlabsConnectionData, UnmatchedDonation, ShopItemRow, CodeRow, CodeConfig, EventRow, Drop, PendingOrder, StreamAlertsData } from "./types";

// Heavy, rarely-first-viewed admin sections split into their own lazy chunks
// (keeps the initial /admin client bundle smaller). See components/admin/sections/.
function SectionLoading() {
  const t = useTranslations("admin");
  return <div className="text-zinc-600 text-sm">{t("loading")}</div>;
}
const AnalyticsSection = dynamic(() => import("./sections/Analytics").then((m) => m.AnalyticsSection), { ssr: false, loading: SectionLoading });
const EconomyHealthSection = dynamic(() => import("./sections/EconomyHealth").then((m) => m.EconomyHealthSection), { ssr: false, loading: SectionLoading });
const CommunitySection = dynamic(() => import("./sections/Community").then((m) => m.CommunitySection), { ssr: false, loading: SectionLoading });
const ClanWarsManager = dynamic(() => import("./sections/ClanWars").then((m) => m.ClanWarsManager), { ssr: false, loading: SectionLoading });
const SoundRewardsManager = dynamic(() => import("./sections/SoundRewards").then((m) => m.SoundRewardsManager), { ssr: false, loading: SectionLoading });
const PaymentMethodsManager = dynamic(() => import("./sections/PaymentMethods").then((m) => m.PaymentMethodsManager), { ssr: false, loading: SectionLoading });
const PushBroadcastManager = dynamic(() => import("./sections/PushBroadcast").then((m) => m.PushBroadcastManager), { ssr: false, loading: SectionLoading });
const SponsorsManager = dynamic(() => import("./sections/Sponsors").then((m) => m.SponsorsManager), { ssr: false, loading: SectionLoading });
const SceneBuilder = dynamic(() => import("./sections/SceneBuilder").then((m) => m.SceneBuilder), { ssr: false, loading: SectionLoading });
const CollectiblesManager = dynamic(() => import("./sections/Collectibles").then((m) => m.CollectiblesManager), { ssr: false, loading: SectionLoading });
const RecapManager = dynamic(() => import("./sections/Recap").then((m) => m.RecapManager), { ssr: false, loading: SectionLoading });
const ClipDirectorManager = dynamic(() => import("./sections/ClipDirector").then((m) => m.ClipDirectorManager), { ssr: false, loading: SectionLoading });
const TriviaManager = dynamic(() => import("./sections/Trivia").then((m) => m.TriviaManager), { ssr: false, loading: SectionLoading });
const TwoFactorManager = dynamic(() => import("./sections/TwoFactor").then((m) => m.TwoFactorManager), { ssr: false, loading: SectionLoading });
const AuditLogSection = dynamic(() => import("./sections/AuditLog").then((m) => m.AuditLogSection), { ssr: false, loading: SectionLoading });
const PollsManager = dynamic(() => import("./sections/Polls").then((m) => m.PollsManager), { ssr: false, loading: SectionLoading });
const ModerationManager = dynamic(() => import("./sections/Moderation").then((m) => m.ModerationManager), { ssr: false, loading: SectionLoading });
const WidgetsLibrary = dynamic(() => import("./sections/Widgets").then((m) => m.WidgetsLibrary), { ssr: false, loading: SectionLoading });
const IntegrationsManager = dynamic(() => import("./sections/Integrations").then((m) => m.IntegrationsManager), { ssr: false, loading: SectionLoading });
const WheelManager = dynamic(() => import("./sections/Wheel").then((m) => m.WheelManager), { ssr: false, loading: SectionLoading });
const WebhooksOutManager = dynamic(() => import("./sections/WebhooksOut").then((m) => m.WebhooksOutManager), { ssr: false, loading: SectionLoading });
const GamesLibraryManager = dynamic(() => import("./sections/GamesLibrary").then((m) => m.GamesLibraryManager), { ssr: false, loading: SectionLoading });
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
const TenantsManager = dynamic(() => import("./sections/Tenants").then((m) => m.TenantsManager), { ssr: false, loading: SectionLoading });

// Panel modes: how much of the admin is shown in the nav. Persisted per browser
// (localStorage "ge-admin-mode"); defaults to "dev" = everything, the pre-modes behavior.
type AdminMode = "simple" | "advanced" | "dev";
const MODE_RANK: Record<AdminMode, number> = { simple: 1, advanced: 2, dev: 3 };
const MODES: AdminMode[] = ["simple", "advanced", "dev"];

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
  isAdmin, isPlatformOwner = false, myPermissions,
  stats, drops, events, pendingOrders,
}: {
  isAdmin: boolean;
  /** Permanent-admin email (admin-of-admins) — unlocks the Tenants section. */
  isPlatformOwner?: boolean;
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
  const t = useTranslations("admin");
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [toast, setToast] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);
  const { tokenSymbol } = useTenantBranding();

  // Navigation sections — each maps to a group of cards previously rendered linearly.
  // `permission` returns true if the user can see ANY card in this section.
  type SectionId =
    | "dashboard" | "users" | "merge" | "events" | "shop" | "drops"
    | "schedule" | "bot" | "donations" | "twitch" | "kick" | "youtube" | "chat" | "moderation" | "timers" | "faq" | "welcome" | "songs" | "widgets" | "alerts" | "goals" | "subathon" | "predictions" | "seasons" | "achievements" | "polls" | "analytics" | "economy" | "community" | "clanwars" | "soundrewards" | "payments" | "sponsors" | "scenes" | "collectibles" | "notifications" | "recap" | "clipdirector" | "trivia" | "audit" | "twofactor" | "integrations" | "wheel" | "webhooks" | "games" | "tenants";

  // `level` maps a section to the panel mode that reveals it in the nav:
  // 1 = everyday tools (simple), 2 = full streamer toolkit (advanced), 3 = developer.
  // Deep links / palette / dashboard jumps still open ANY permitted section.
  const SECTIONS: Array<{
    id: SectionId;
    label: string;
    icon: typeof Users;
    group: string;
    level: 1 | 2 | 3;
    permission: () => boolean;
  }> = [
    { id: "dashboard", label: t("secDashboard"),   icon: LayoutDashboard, group: "main",       level: 1, permission: () => true },
    { id: "analytics", label: t("secAnalytics"),    icon: TrendingUp,     group: "main",       level: 2, permission: () => isAdmin },
    { id: "recap",     label: t("secRecap"),        icon: Sparkles,       group: "main",       level: 3, permission: () => isAdmin },
    { id: "clipdirector", label: t("secClipDirector"), icon: Clapperboard, group: "main",       level: 3, permission: () => isAdmin },
    { id: "economy",   label: t("secEconomy"),      icon: Coins,          group: "main",       level: 2, permission: () => isAdmin },
    { id: "payments",  label: t("secPayments"),     icon: Wallet,         group: "main",       level: 2, permission: () => isAdmin },
    { id: "notifications", label: t("secNotifications"), icon: Megaphone,  group: "main",       level: 2, permission: () => isAdmin },
    { id: "sponsors",  label: t("secSponsors"),     icon: Handshake,      group: "main",       level: 2, permission: () => isAdmin },
    { id: "collectibles", label: t("secCollectibles"), icon: Sparkles,    group: "main",       level: 2, permission: () => isAdmin },
    { id: "community", label: t("secCommunity"),    icon: Users,          group: "main",       level: 2, permission: () => isAdmin },
    { id: "clanwars",  label: t("secClanwars"),     icon: Swords,         group: "main",       level: 2, permission: () => isAdmin },
    { id: "trivia",    label: t("secTrivia"),       icon: Brain,          group: "main",       level: 2, permission: () => isAdmin },
    { id: "integrations", label: t("secIntegrations"), icon: Plug,          group: "main",       level: 3, permission: () => isAdmin },
    { id: "webhooks",  label: t("secWebhooks"),     icon: Webhook,         group: "main",       level: 3, permission: () => isAdmin },
    { id: "tenants",   label: t("secTenants"),      icon: Building2,       group: "main",       level: 3, permission: () => isPlatformOwner },

    { id: "users",     label: t("secUsers"), icon: UserCog,         group: "moderation", level: 1, permission: () => can("grant_tokens") || isAdmin || can("mark_subs") },
    { id: "merge",     label: t("secMerge"), icon: GitMerge,   group: "moderation", level: 2, permission: () => isAdmin },
    { id: "moderation", label: t("secModeration"),    icon: ShieldCheck,   group: "moderation", level: 2, permission: () => isAdmin },
    { id: "audit",     label: t("secAudit"),   icon: History,         group: "moderation", level: 2, permission: () => can("view_audit") },
    { id: "twofactor", label: t("secTwofactor"), icon: KeyRound,      group: "moderation", level: 3, permission: () => isAdmin },

    { id: "twitch",    label: t("secTwitch"),      icon: Tv,              group: "platforms",  level: 2, permission: () => isAdmin },
    { id: "kick",      label: t("secKick"),        icon: Radio,           group: "platforms",  level: 2, permission: () => isAdmin },
    { id: "youtube",   label: t("secYoutube"),     icon: MonitorPlay,     group: "platforms",  level: 2, permission: () => isAdmin },

    { id: "bot",       label: t("secBot"), icon: Bot,             group: "bot",        level: 2, permission: () => can("manage_shop") },
    { id: "chat",      label: t("secChat"), icon: MessageSquare, group: "bot",        level: 2, permission: () => isAdmin },
    { id: "timers",    label: t("secTimers"),        icon: Clock,         group: "bot",        level: 2, permission: () => isAdmin },
    { id: "faq",       label: t("secFaq"),    icon: HelpCircle,    group: "bot",        level: 2, permission: () => isAdmin },
    { id: "welcome",   label: t("secWelcome"),     icon: UserPlus,      group: "bot",        level: 2, permission: () => isAdmin },
    { id: "songs",     label: t("secSongs"), icon: Music,         group: "bot",        level: 2, permission: () => isAdmin },

    { id: "widgets",   label: t("secWidgets"), icon: LayoutGrid,    group: "overlays",   level: 2, permission: () => isAdmin },
    { id: "scenes",    label: t("secScenes"), icon: Layers,         group: "overlays",   level: 2, permission: () => isAdmin },
    { id: "alerts",    label: t("secAlerts"), icon: Bell,          group: "overlays",   level: 1, permission: () => isAdmin },
    { id: "soundrewards", label: t("secSoundrewards"), icon: Volume2, group: "overlays",   level: 2, permission: () => isAdmin },
    { id: "goals",     label: t("secGoals"), icon: Target,         group: "overlays",   level: 1, permission: () => isAdmin },
    { id: "subathon",  label: t("secSubathon"),      icon: Hourglass,     group: "overlays",   level: 2, permission: () => isAdmin },

    { id: "shop",      label: t("secShop"),       icon: ShoppingBag,     group: "economy",    level: 1, permission: () => can("manage_shop") || can("deliver_orders") },
    { id: "drops",     label: t("secDrops"),       icon: Gift,            group: "economy",    level: 1, permission: () => can("create_drops") },
    { id: "seasons",   label: t("secSeasons"), icon: Ticket,          group: "economy",    level: 2, permission: () => isAdmin },
    { id: "wheel",     label: t("secWheel"), icon: Disc3,          group: "economy",    level: 2, permission: () => isAdmin },
    { id: "donations", label: t("secDonations"),     icon: Heart,           group: "economy",    level: 2, permission: () => isAdmin },

    { id: "events",    label: t("secEvents"),      icon: Calendar,        group: "community",  level: 1, permission: () => can("create_events") || can("edit_events") || can("draw_events") },
    { id: "predictions", label: t("secPredictions"), icon: Dice5,         group: "community",  level: 1, permission: () => can("create_events") },
    { id: "polls",     label: t("secPolls"),     icon: BarChart3,       group: "community",  level: 1, permission: () => isAdmin },
    { id: "achievements", label: t("secAchievements"), icon: Award,        group: "community",  level: 2, permission: () => isAdmin },
    { id: "schedule",  label: t("secSchedule"), icon: CalendarDays,    group: "community",  level: 1, permission: () => can("manage_shop") },
    { id: "games",     label: t("secGames"), icon: Gamepad2,    group: "community",  level: 2, permission: () => isAdmin },
  ];

  // Panel mode: filters the NAV only — never what a user is permitted to open.
  const [adminMode, setAdminMode] = useState<AdminMode>("dev");
  useEffect(() => {
    const saved = localStorage.getItem("ge-admin-mode");
    if (saved === "simple" || saved === "advanced" || saved === "dev") setAdminMode(saved);
  }, []);
  const changeMode = useCallback((m: AdminMode) => {
    setAdminMode(m);
    try { localStorage.setItem("ge-admin-mode", m); } catch { /* private mode */ }
  }, []);

  const permittedSections = SECTIONS.filter((s) => s.permission());
  const visibleSections = permittedSections.filter((s) => s.level <= MODE_RANK[adminMode]);
  const hiddenByMode = permittedSections.length - visibleSections.length;

  // URL hash → active section (deep-linkable: /admin#shop)
  const [activeSection, setActiveSection] = useState<SectionId>("dashboard");
  useEffect(() => {
    const fromHash = () => {
      const raw = window.location.hash.replace(/^#/, "");
      // permitted (not mode-visible): a deep link must open the section even
      // when the current panel mode hides it from the nav
      const known = permittedSections.find((s) => s.id === raw);
      setActiveSection(known ? known.id : "dashboard");
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
    // permittedSections recomputed each render — depending on perms, not on every state change
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
        setToast({ kind: "ok", msg: t("oauthOk", { label: p.label }) });
        matched = true;
      } else if (params.has(p.err)) {
        setToast({ kind: "err", msg: t("oauthErr", { label: p.label, err: params.get(p.err) ?? "" }) });
        matched = true;
      }
    }
    if (matched) {
      setTimeout(() => setToast(null), 7000);
      const url = new URL(window.location.href);
      ["kick_success","kick_error","twitch_success","twitch_error","yt_success","yt_error"]
        .forEach((k) => { url.searchParams.delete(k); });
      window.history.replaceState(null, "", url.toString());
    }
  }, [t]);

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
        <StatTile label={t("statUsers")} value={fmt(stats.totalUsers, locale)} icon={Users} />
        <StatTile label={t("statTokensCirc")} value={fmt(stats.totalTokensInCirculation, locale)} suffix={tokenSymbol} icon={Coins} />
        <StatTile label={t("statEverEarned")} value={fmt(stats.totalEverEarned, locale)} suffix={tokenSymbol} icon={TrendingUp} />
        <StatTile label={t("statActiveEvents")} value={fmt(stats.eventsActive, locale)} icon={Calendar} />
        <StatTile label={t("statPendingOrders")} value={fmt(stats.ordersPending, locale)} icon={Package} accent={stats.ordersPending > 0} />
      </div>

      {!isAdmin && (
        <div className="border border-blue-700 bg-blue-950/30 px-4 py-2.5 text-xs text-blue-200">
          🛡️ {t.rich("modAs", { b: (c) => <strong>{c}</strong> })} {t("modPerms")}{" "}
          <span className="font-mono">{myPermissions.length === 0 ? t("permsNone") : myPermissions.join(", ")}</span>.
          {" "}{t("modHidden")}
        </div>
      )}

      {/* Two-column layout: nav (sidebar / top scroll on mobile) + active section content */}
      <div className="flex flex-col lg:flex-row gap-6">
        <AdminNav
          sections={visibleSections}
          active={activeSection}
          onSelect={goToSection}
          mode={adminMode}
          onModeChange={changeMode}
          hiddenByMode={hiddenByMode}
        />
        {/* palette searches everything permitted — it's the escape hatch in simple mode */}
        <CommandPalette sections={permittedSections} onSelect={goToSection} />

        <div key={activeSection} className="flex-1 min-w-0 space-y-6 animate-fade-in-up">
          {activeSection !== "dashboard" && (
            <div className="border border-zinc-800/80 bg-zinc-950/50 px-4 py-2.5 flex items-start gap-2.5 text-xs text-zinc-400 leading-relaxed">
              <span aria-hidden className="shrink-0">💡</span>
              <p>{t(`secDesc_${activeSection}`)}</p>
            </div>
          )}
          {activeSection === "dashboard" && (
            <DashboardSection
              stats={stats}
              drops={drops}
              events={events}
              pendingOrders={pendingOrders}
              onJump={(id) => goToSection(id as SectionId)}
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

          {activeSection === "integrations" && isAdmin && (
            <IntegrationsManager {...sharedProps} />
          )}

          {activeSection === "wheel" && isAdmin && (
            <WheelManager {...sharedProps} />
          )}

          {activeSection === "webhooks" && isAdmin && (
            <WebhooksOutManager {...sharedProps} />
          )}

          {activeSection === "games" && isAdmin && (
            <GamesLibraryManager {...sharedProps} />
          )}

          {activeSection === "tenants" && isPlatformOwner && (
            <TenantsManager {...sharedProps} />
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
          {activeSection === "economy" && isAdmin && <EconomyHealthSection />}
          {activeSection === "community" && isAdmin && <CommunitySection />}
          {activeSection === "clanwars" && isAdmin && <ClanWarsManager onToast={showToast} />}
          {activeSection === "soundrewards" && isAdmin && <SoundRewardsManager onToast={showToast} />}
          {activeSection === "payments" && isAdmin && <PaymentMethodsManager onToast={showToast} />}
          {activeSection === "notifications" && isAdmin && <PushBroadcastManager onToast={showToast} />}
          {activeSection === "sponsors" && isAdmin && <SponsorsManager onToast={showToast} />}
          {activeSection === "scenes" && isAdmin && <SceneBuilder onToast={showToast} />}
          {activeSection === "collectibles" && isAdmin && <CollectiblesManager onToast={showToast} />}
          {activeSection === "recap" && isAdmin && <RecapManager onToast={showToast} />}
          {activeSection === "clipdirector" && isAdmin && <ClipDirectorManager onToast={showToast} />}
          {activeSection === "trivia" && isAdmin && <TriviaManager onToast={showToast} />}
          {activeSection === "twofactor" && isAdmin && <TwoFactorManager onToast={showToast} />}

          {activeSection === "audit" && can("view_audit") && (
            <LazySection<{ auditLog: AuditEntry[] }> s="audit">
              {(d) => <AuditLogSection auditLog={d.auditLog} />}
            </LazySection>
          )}
        </div>
      </div>

      {/* AI helper — describe a goal, get steps with section-jump buttons */}
      <AdminAssistant
        sections={permittedSections.map((s) => ({ id: s.id, label: s.label }))}
        onJump={(id) => goToSection(id as SectionId)}
      />

      {toast && (
        <div
          role={toast.kind === "ok" ? "status" : "alert"}
          aria-live={toast.kind === "ok" ? "polite" : "assertive"}
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
  const t = useTranslations("admin");
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
          throw new Error(e.error ?? t("errStatus", { status: r.status }));
        }
        return r.json();
      })
      .then((d) => { if (!cancelled) setData(d as T); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : t("loadError")); });
    return () => { cancelled = true; };
  }, [s, reloadKey, t]);

  if (error) {
    return <ErrorState message={t("sectionError", { error })} onRetry={() => setReloadKey((k) => k + 1)} />;
  }
  if (data === null) {
    return (
      <div className="border border-zinc-800 bg-black/30 p-8 flex items-center justify-center gap-2 text-zinc-500 text-sm">
        <Loader2 className="w-4 h-4 animate-spin" /> {t("loadingSection")}
      </div>
    );
  }
  return <>{children(data)}</>;
}

// ============== ADMIN NAV ==============

// Sidebar groups (order + labels). Sections carry a `group` key matching these.
// `label` is an "admin" namespace key (translated in AdminNav).
const NAV_GROUPS: Array<{ key: string; label: string }> = [
  { key: "main",       label: "grpMain" },
  { key: "moderation", label: "grpModeration" },
  { key: "platforms",  label: "grpPlatforms" },
  { key: "bot",        label: "grpBot" },
  { key: "overlays",   label: "grpOverlays" },
  { key: "economy",    label: "grpEconomy" },
  { key: "community",  label: "grpCommunity" },
];

function AdminNav<T extends string>({
  sections, active, onSelect, mode, onModeChange, hiddenByMode,
}: {
  sections: Array<{ id: T; label: string; icon: typeof Users; group: string }>;
  active: T;
  onSelect: (id: T) => void;
  mode: AdminMode;
  onModeChange: (m: AdminMode) => void;
  hiddenByMode: number;
}) {
  const t = useTranslations("admin");
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
        <div className="grid grid-cols-3 gap-0.5 mb-1" role="group" aria-label={t("modeLabel")}>
          {MODES.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => onModeChange(m)}
              title={t(`modeTip_${m}`)}
              className={cn(
                "px-1 py-1.5 text-[9px] font-mono uppercase tracking-wider border transition-colors truncate",
                mode === m
                  ? "border-red-700 bg-red-950/40 text-white"
                  : "border-zinc-800 text-zinc-500 hover:text-zinc-200 hover:border-zinc-600",
              )}
            >
              {t(`mode_${m}`)}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => openCommandPalette()}
          className="flex items-center gap-2 px-2.5 py-2 mb-1 text-[11px] text-zinc-400 hover:text-white border border-zinc-800 hover:border-zinc-600 transition-colors"
          title={t("searchTitle")}
        >
          <Search className="w-3.5 h-3.5 shrink-0" />
          <span className="flex-1 text-left">{t("search")}</span>
          <kbd className="text-[9px] font-mono text-zinc-600 border border-zinc-800 px-1 py-0.5">Ctrl K</kbd>
        </button>
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
                  {t(g.label)}
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
        {hiddenByMode > 0 && (
          <button
            type="button"
            onClick={() => onModeChange(mode === "simple" ? "advanced" : "dev")}
            className="px-2 py-1.5 text-left text-[9px] text-zinc-600 hover:text-zinc-400 transition-colors"
          >
            {t("modeHidden", { count: hiddenByMode })} ▸
          </button>
        )}
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
  onJump: (id: string) => void;
}) {
  const t = useTranslations("admin");
  const locale = useLocale();
  const nf = locale;
  return (
    <div className="space-y-6">
      <SetupStatusCard onJump={onJump} />
      <SectionCard title={t("dashNeedsAttention")} icon={LayoutDashboard}>
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
                {t("statPendingOrders")}
              </span>
            </div>
            <div className="text-2xl font-mono font-bold text-white">{fmt(stats.ordersPending, locale)}</div>
            {stats.ordersPending > 0 && (
              <div className="text-[10px] text-orange-300 mt-1">{t("dashClickDeliver")}</div>
            )}
          </button>

          <button
            onClick={() => onJump("events")}
            className="border border-zinc-800 bg-black/30 p-4 text-left hover:border-red-700 transition-colors"
          >
            <div className="flex items-center gap-2 mb-1">
              <Calendar className="w-4 h-4 text-zinc-500" />
              <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">
                {t("statActiveEvents")}
              </span>
            </div>
            <div className="text-2xl font-mono font-bold text-white">{fmt(events.length, locale)}</div>
            <div className="text-[10px] text-zinc-500 mt-1">
              {t("dashWithDraw", { count: events.filter((e) => e.type !== "happy_hour").length })}
            </div>
          </button>

          <button
            onClick={() => onJump("drops")}
            className="border border-zinc-800 bg-black/30 p-4 text-left hover:border-red-700 transition-colors"
          >
            <div className="flex items-center gap-2 mb-1">
              <Gift className="w-4 h-4 text-zinc-500" />
              <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">
                {t("dashActiveDrops")}
              </span>
            </div>
            <div className="text-2xl font-mono font-bold text-white">{fmt(drops.length, locale)}</div>
            <div className="text-[10px] text-zinc-500 mt-1">
              {t("dashClaimedTotal", { count: drops.reduce((acc, d) => acc + d.claimsCount, 0) })}
            </div>
          </button>
        </div>
      </SectionCard>

      <SectionCard title={t("dashShortcuts")} icon={Zap}>
        <p className="text-zinc-500 text-xs mb-3">
          {t("dashShortcutsHint")}
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[10px] font-mono uppercase tracking-widest">
          <a href="#users" onClick={(e) => { e.preventDefault(); onJump("events"); }} className="border border-zinc-800 bg-black/30 p-3 hover:border-red-700 text-zinc-300">
            ▸ {t("secEvents")}
          </a>
          <a href="#drops" onClick={(e) => { e.preventDefault(); onJump("drops"); }} className="border border-zinc-800 bg-black/30 p-3 hover:border-red-700 text-zinc-300">
            ▸ {t("scNewDrop")}
          </a>
          <a href="#alerts" onClick={(e) => { e.preventDefault(); onJump("alerts"); }} className="border border-zinc-800 bg-black/30 p-3 hover:border-red-700 text-zinc-300">
            ▸ {t("scObsAlerts")}
          </a>
          <a href="#shop" onClick={(e) => { e.preventDefault(); onJump("shop"); }} className="border border-zinc-800 bg-black/30 p-3 hover:border-red-700 text-zinc-300">
            ▸ {t("secShop")}
          </a>
        </div>
      </SectionCard>

      {pendingOrders.length > 0 && (
        <SectionCard title={t("dashPendingList", { count: pendingOrders.length })} icon={Package}>
          <div className="space-y-1 text-[10px] font-mono">
            {pendingOrders.slice(0, 5).map((o) => (
              <div key={o.id} className="flex items-center gap-2 border-l-2 border-orange-700 pl-2 py-1">
                <span className="text-orange-300">{o.shopItem?.imageEmoji ?? "📦"} {o.shopItem?.name ?? "?"}</span>
                <span className="text-zinc-500 truncate">
                  {o.user.displayName || o.user.username || o.user.discordUsername || t("anon")}
                </span>
                <span className="text-zinc-700 ml-auto shrink-0">
                  {new Date(o.createdAt).toLocaleString(nf, { dateStyle: "short", timeStyle: "short" })}
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
