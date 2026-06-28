"use client";
// src/components/admin/lazy-sections.tsx
// Lazy-loaded admin section chunks (#736) — extracted from AdminClient.tsx so the shell file
// stays focused on layout + state. Each is a next/dynamic({ ssr:false }) wrapper; SectionLoading
// is the shared fallback. Imported back by AdminClient.
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";

// Heavy, rarely-first-viewed admin sections split into their own lazy chunks
// (keeps the initial /admin client bundle smaller). See components/admin/sections/.
function SectionLoading() {
  const t = useTranslations("admin");
  return <div className="text-zinc-600 text-sm">{t("loading")}</div>;
}
export const AnalyticsSection = dynamic(() => import("./sections/Analytics").then((m) => m.AnalyticsSection), { ssr: false, loading: SectionLoading });
export const EconomyHealthSection = dynamic(() => import("./sections/EconomyHealth").then((m) => m.EconomyHealthSection), { ssr: false, loading: SectionLoading });
export const CommunitySection = dynamic(() => import("./sections/Community").then((m) => m.CommunitySection), { ssr: false, loading: SectionLoading });
export const ClanWarsManager = dynamic(() => import("./sections/ClanWars").then((m) => m.ClanWarsManager), { ssr: false, loading: SectionLoading });
export const SoundRewardsManager = dynamic(() => import("./sections/SoundRewards").then((m) => m.SoundRewardsManager), { ssr: false, loading: SectionLoading });
export const PaymentMethodsManager = dynamic(() => import("./sections/PaymentMethods").then((m) => m.PaymentMethodsManager), { ssr: false, loading: SectionLoading });
export const PushBroadcastManager = dynamic(() => import("./sections/PushBroadcast").then((m) => m.PushBroadcastManager), { ssr: false, loading: SectionLoading });
export const SponsorsManager = dynamic(() => import("./sections/Sponsors").then((m) => m.SponsorsManager), { ssr: false, loading: SectionLoading });
export const SceneBuilder = dynamic(() => import("./sections/SceneBuilder").then((m) => m.SceneBuilder), { ssr: false, loading: SectionLoading });
export const CollectiblesManager = dynamic(() => import("./sections/Collectibles").then((m) => m.CollectiblesManager), { ssr: false, loading: SectionLoading });
export const RecapManager = dynamic(() => import("./sections/Recap").then((m) => m.RecapManager), { ssr: false, loading: SectionLoading });
export const ClipDirectorManager = dynamic(() => import("./sections/ClipDirector").then((m) => m.ClipDirectorManager), { ssr: false, loading: SectionLoading });
export const TriviaManager = dynamic(() => import("./sections/Trivia").then((m) => m.TriviaManager), { ssr: false, loading: SectionLoading });
export const TwoFactorManager = dynamic(() => import("./sections/TwoFactor").then((m) => m.TwoFactorManager), { ssr: false, loading: SectionLoading });
export const AuditLogSection = dynamic(() => import("./sections/AuditLog").then((m) => m.AuditLogSection), { ssr: false, loading: SectionLoading });
export const PollsManager = dynamic(() => import("./sections/Polls").then((m) => m.PollsManager), { ssr: false, loading: SectionLoading });
export const ModerationManager = dynamic(() => import("./sections/Moderation").then((m) => m.ModerationManager), { ssr: false, loading: SectionLoading });
export const WidgetsLibrary = dynamic(() => import("./sections/Widgets").then((m) => m.WidgetsLibrary), { ssr: false, loading: SectionLoading });
export const IntegrationsManager = dynamic(() => import("./sections/Integrations").then((m) => m.IntegrationsManager), { ssr: false, loading: SectionLoading });
export const ObsRulesManager = dynamic(() => import("./sections/ObsRules").then((m) => m.ObsRulesManager), { ssr: false, loading: SectionLoading });
export const GoveeRulesManager = dynamic(() => import("./sections/GoveeRules").then((m) => m.GoveeRulesManager), { ssr: false, loading: SectionLoading });
export const WheelManager = dynamic(() => import("./sections/Wheel").then((m) => m.WheelManager), { ssr: false, loading: SectionLoading });
export const WebhooksOutManager = dynamic(() => import("./sections/WebhooksOut").then((m) => m.WebhooksOutManager), { ssr: false, loading: SectionLoading });
export const GamesLibraryManager = dynamic(() => import("./sections/GamesLibrary").then((m) => m.GamesLibraryManager), { ssr: false, loading: SectionLoading });
export const AchievementsManager = dynamic(() => import("./sections/Achievements").then((m) => m.AchievementsManager), { ssr: false, loading: SectionLoading });
export const PredictionsManager = dynamic(() => import("./sections/Predictions").then((m) => m.PredictionsManager), { ssr: false, loading: SectionLoading });
export const BountiesManager = dynamic(() => import("./sections/Bounties").then((m) => m.BountiesManager), { ssr: false, loading: SectionLoading });
export const WelcomeManager = dynamic(() => import("./sections/Welcome").then((m) => m.WelcomeManager), { ssr: false, loading: SectionLoading });
export const FaqManager = dynamic(() => import("./sections/Faq").then((m) => m.FaqManager), { ssr: false, loading: SectionLoading });
export const ChatTimersManager = dynamic(() => import("./sections/ChatTimers").then((m) => m.ChatTimersManager), { ssr: false, loading: SectionLoading });
export const ChatCommandsManager = dynamic(() => import("./sections/ChatCommands").then((m) => m.ChatCommandsManager), { ssr: false, loading: SectionLoading });
export const SongQueueManager = dynamic(() => import("./sections/SongQueue").then((m) => m.SongQueueManager), { ssr: false, loading: SectionLoading });
export const SubathonManager = dynamic(() => import("./sections/Subathon").then((m) => m.SubathonManager), { ssr: false, loading: SectionLoading });
export const GrantTokensCard = dynamic(() => import("./sections/GrantTokens").then((m) => m.GrantTokensCard), { ssr: false, loading: SectionLoading });
export const CreateDropCard = dynamic(() => import("./sections/CreateDrop").then((m) => m.CreateDropCard), { ssr: false, loading: SectionLoading });
export const DatabaseResetCard = dynamic(() => import("./sections/DatabaseReset").then((m) => m.DatabaseResetCard), { ssr: false, loading: SectionLoading });
export const CustomAlertsCard = dynamic(() => import("./sections/CustomAlerts").then((m) => m.CustomAlertsCard), { ssr: false, loading: SectionLoading });
export const ChatOverlayCard = dynamic(() => import("./sections/ChatOverlay").then((m) => m.ChatOverlayCard), { ssr: false, loading: SectionLoading });
export const StreamGoalsManager = dynamic(() => import("./sections/StreamGoals").then((m) => m.StreamGoalsManager), { ssr: false, loading: SectionLoading });
export const KickEventsManager = dynamic(() => import("./sections/KickEvents").then((m) => m.KickEventsManager), { ssr: false, loading: SectionLoading });
export const YouTubeLiveManager = dynamic(() => import("./sections/YouTubeLive").then((m) => m.YouTubeLiveManager), { ssr: false, loading: SectionLoading });
export const RumbleManager = dynamic(() => import("./sections/Rumble").then((m) => m.RumbleManager), { ssr: false, loading: SectionLoading });
export const SeasonsManager = dynamic(() => import("./sections/Seasons").then((m) => m.SeasonsManager), { ssr: false, loading: SectionLoading });
export const MergeUsersSection = dynamic(() => import("./sections/MergeUsers").then((m) => m.MergeUsersSection), { ssr: false, loading: SectionLoading });
export const BotConfigCard = dynamic(() => import("./sections/BotConfig").then((m) => m.BotConfigCard), { ssr: false, loading: SectionLoading });
export const ScheduleManager = dynamic(() => import("./sections/Schedule").then((m) => m.ScheduleManager), { ssr: false, loading: SectionLoading });
export const TwitchEventSubManager = dynamic(() => import("./sections/TwitchEventSub").then((m) => m.TwitchEventSubManager), { ssr: false, loading: SectionLoading });
export const StreamlabsManager = dynamic(() => import("./sections/Streamlabs").then((m) => m.StreamlabsManager), { ssr: false, loading: SectionLoading });
export const UserRolesCard = dynamic(() => import("./sections/UserRoles").then((m) => m.UserRolesCard), { ssr: false, loading: SectionLoading });
export const ConnectionRolesCard = dynamic(() => import("./sections/UserRoles").then((m) => m.ConnectionRolesCard), { ssr: false, loading: SectionLoading });
export const ShopManager = dynamic(() => import("./sections/Shop").then((m) => m.ShopManager), { ssr: false, loading: SectionLoading });
export const CodeDropsCard = dynamic(() => import("./sections/CodeDrops").then((m) => m.CodeDropsCard), { ssr: false, loading: SectionLoading });
export const HolidayEventsCard = dynamic(() => import("./sections/Events").then((m) => m.HolidayEventsCard), { ssr: false, loading: SectionLoading });
export const CreateEventCard = dynamic(() => import("./sections/Events").then((m) => m.CreateEventCard), { ssr: false, loading: SectionLoading });
export const EventsManager = dynamic(() => import("./sections/Events").then((m) => m.EventsManager), { ssr: false, loading: SectionLoading });
export const ActiveDropsList = dynamic(() => import("./sections/ActiveDrops").then((m) => m.ActiveDropsList), { ssr: false, loading: SectionLoading });
export const PendingOrdersList = dynamic(() => import("./sections/PendingOrders").then((m) => m.PendingOrdersList), { ssr: false, loading: SectionLoading });
export const StreamAlertsManager = dynamic(() => import("./sections/StreamAlerts").then((m) => m.StreamAlertsManager), { ssr: false, loading: SectionLoading });
export const TenantsManager = dynamic(() => import("./sections/Tenants").then((m) => m.TenantsManager), { ssr: false, loading: SectionLoading });
export const SupportTicketsManager = dynamic(() => import("./sections/SupportTickets").then((m) => m.SupportTicketsManager), { ssr: false, loading: SectionLoading });
export const RoleRoster = dynamic(() => import("./sections/RoleRoster").then((m) => m.RoleRoster), { ssr: false, loading: SectionLoading });
export const SubscribersManager = dynamic(() => import("./sections/Subscribers").then((m) => m.SubscribersManager), { ssr: false, loading: SectionLoading });
export const SupportPreview = dynamic(() => import("./sections/SupportPreview").then((m) => m.SupportPreview), { ssr: false, loading: SectionLoading });
