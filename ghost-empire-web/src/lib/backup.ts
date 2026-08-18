// src/lib/backup.ts
// Buduje kopię zapasową JSON: konfiguracja + katalogi treści + salda użytkowników.
// Świadomie POMIJA sekrety/PII (konta auth, sesje, tokeny OAuth, adresy wysyłki, dane
// darczyńców) oraz wolumen/efemerydy (feed czatu, kolejka alertów, logi, rate-limity).
// Wspólne dla pobrania z panelu (/api/admin/backup) i crona off-site (/api/cron/backup).
// Odczyty są GLOBALNE (wszystkie portale), więc wołający MUSI zabramkować to do właściciela platformy.
//
// ⚠️ Kopia rozjeżdżała się po cichu: przez długi czas obejmowała 24 ze 111 modeli i NIC tego nie
// pilnowało — kolejne funkcje dokładały tabele, o których kopia nie wiedziała. Restore gubił przez
// to `Tenant` (nazwa portalu, waluta, kolory, logo, socjale), `TenantCopy` (własne teksty portalu),
// sceny overlaya i reguły OBS/Govee/Hue — czyli **całą tożsamość white-label**. Dlatego podział jest
// teraz JAWNY i wyczerpujący: każdy model schemy jest albo w {@link MODELE_W_KOPII}, albo w
// {@link MODELE_POZA_KOPIA} z powodem, a test `backup-coverage` failuje, gdy pojawi się model
// spoza obu list. Nowy model wymusza decyzję zamiast po cichu zniknąć.
import { prisma } from "@/lib/prisma";

/**
 * Modele schemy, których treść trafia do kopii. Trzymane osobno od samego zapytania,
 * żeby test pokrycia mógł je porównać z `schema.prisma`.
 */
export const MODELE_W_KOPII: readonly string[] = [
  "ShopItem",
  "Event",
  "Achievement",
  "ChatCommand",
  "ChatTimer",
  "FaqResponse",
  "WelcomeConfig",
  "BotConfig",
  "StreamScheduleSlot",
  "Subathon",
  "ModerationConfig",
  "Season",
  "SeasonReward",
  "StreamAlertSettings",
  "AlertTypeConfig",
  "StreamCode",
  "CodeDropConfig",
  "Poll",
  "Prediction",
  "StreamGoal",
  "ChatOverlayConfig",
  "CustomAlert",
  "CustomWidget",
  "User",
  "Tenant",
  "TenantCopy",
  "OverlayScene",
  "ObsRule",
  "GoveeRule",
  "HueRule",
  "WheelConfig",
  "SoundReward",
  "PaymentMethod",
  "Sponsor",
  "Collectible",
  "TriviaQuestion",
  "PenaltyConfig",
  "Penalty",
  "Game",
  "ClipDirectorConfig",
  "SupportGoal",
  "Bounty",
  "DailyTask",
  "StreamDrop",
  "SongRequestBan",
];

/**
 * Modele świadomie POZA kopią — nazwa → powód. Powód jest częścią kontraktu, nie komentarzem:
 * przy dokładaniu modelu trzeba tu wpisać, dlaczego kopia go nie niesie, albo dopisać go wyżej.
 */
export const MODELE_POZA_KOPIA: Readonly<Record<string, string>> = {
  Account: "poświadczenia/sekrety — kopia z definicji ich nie niesie; po restore operator wpisuje klucze na nowo",
  AdminAction: "wolumen/efemeryda — odtwarza się sama, a w kopii tylko puchnie",
  Auction: "historia/stan gry użytkowników — kopia niesie SALDA (`users`), nie przebieg rozgrywki",
  AuctionBid: "historia/stan gry użytkowników — kopia niesie SALDA (`users`), nie przebieg rozgrywki",
  AutoClip: "wolumen/efemeryda — odtwarza się sama, a w kopii tylko puchnie",
  BountyPledge: "historia/stan gry użytkowników — kopia niesie SALDA (`users`), nie przebieg rozgrywki",
  CardListing: "historia/stan gry użytkowników — kopia niesie SALDA (`users`), nie przebieg rozgrywki",
  ChatActivityBucket: "wolumen/efemeryda — odtwarza się sama, a w kopii tylko puchnie",
  ChatFeedMessage: "wolumen/efemeryda — odtwarza się sama, a w kopii tylko puchnie",
  Clan: "historia/stan gry użytkowników — kopia niesie SALDA (`users`), nie przebieg rozgrywki",
  ClanWar: "historia/stan gry użytkowników — kopia niesie SALDA (`users`), nie przebieg rozgrywki",
  ClipVote: "historia/stan gry użytkowników — kopia niesie SALDA (`users`), nie przebieg rozgrywki",
  Companion: "historia/stan gry użytkowników — kopia niesie SALDA (`users`), nie przebieg rozgrywki",
  Connection: "poświadczenia/sekrety — kopia z definicji ich nie niesie; po restore operator wpisuje klucze na nowo",
  DiscordLinkCode: "poświadczenia/sekrety — kopia z definicji ich nie niesie; po restore operator wpisuje klucze na nowo",
  Donation: "dane osobowe (adres/telefon/e-mail/nick darczyńcy) — kopia z definicji ich nie niesie",
  DonationClaim: "dane osobowe (adres/telefon/e-mail/nick darczyńcy) — kopia z definicji ich nie niesie",
  DonationIntegration: "poświadczenia/sekrety — kopia z definicji ich nie niesie; po restore operator wpisuje klucze na nowo",
  DropClaim: "historia/stan gry użytkowników — kopia niesie SALDA (`users`), nie przebieg rozgrywki",
  Duel: "historia/stan gry użytkowników — kopia niesie SALDA (`users`), nie przebieg rozgrywki",
  EmojiComboState: "wolumen/efemeryda — odtwarza się sama, a w kopii tylko puchnie",
  EventEntry: "historia/stan gry użytkowników — kopia niesie SALDA (`users`), nie przebieg rozgrywki",
  GameLibraryConfig: "poświadczenia/sekrety — kopia z definicji ich nie niesie; po restore operator wpisuje klucze na nowo",
  GameVote: "historia/stan gry użytkowników — kopia niesie SALDA (`users`), nie przebieg rozgrywki",
  GtGamePlay: "historia/stan gry użytkowników — kopia niesie SALDA (`users`), nie przebieg rozgrywki",
  Heist: "historia/stan gry użytkowników — kopia niesie SALDA (`users`), nie przebieg rozgrywki",
  HeistEntry: "historia/stan gry użytkowników — kopia niesie SALDA (`users`), nie przebieg rozgrywki",
  HypeTrainState: "wolumen/efemeryda — odtwarza się sama, a w kopii tylko puchnie",
  IntegrationConfig: "poświadczenia/sekrety — kopia z definicji ich nie niesie; po restore operator wpisuje klucze na nowo",
  KickEvent: "wolumen/efemeryda — odtwarza się sama, a w kopii tylko puchnie",
  KickEventSubscription: "poświadczenia/sekrety — kopia z definicji ich nie niesie; po restore operator wpisuje klucze na nowo",
  KickStreamerToken: "poświadczenia/sekrety — kopia z definicji ich nie niesie; po restore operator wpisuje klucze na nowo",
  LeagueSeasonResult: "historia/stan gry użytkowników — kopia niesie SALDA (`users`), nie przebieg rozgrywki",
  ModViolationLog: "wolumen/efemeryda — odtwarza się sama, a w kopii tylko puchnie",
  Notification: "wolumen/efemeryda — odtwarza się sama, a w kopii tylko puchnie",
  OutgoingWebhook: "poświadczenia/sekrety — kopia z definicji ich nie niesie; po restore operator wpisuje klucze na nowo",
  Passkey: "poświadczenia/sekrety — kopia z definicji ich nie niesie; po restore operator wpisuje klucze na nowo",
  PenaltyDraw: "historia/stan gry użytkowników — kopia niesie SALDA (`users`), nie przebieg rozgrywki",
  PollVote: "historia/stan gry użytkowników — kopia niesie SALDA (`users`), nie przebieg rozgrywki",
  PortalFollow: "historia/stan gry użytkowników — kopia niesie SALDA (`users`), nie przebieg rozgrywki",
  PredictionEntry: "historia/stan gry użytkowników — kopia niesie SALDA (`users`), nie przebieg rozgrywki",
  PushSubscription: "poświadczenia/sekrety — kopia z definicji ich nie niesie; po restore operator wpisuje klucze na nowo",
  RaffleTicket: "historia/stan gry użytkowników — kopia niesie SALDA (`users`), nie przebieg rozgrywki",
  RateLimitBucket: "wolumen/efemeryda — odtwarza się sama, a w kopii tylko puchnie",
  Session: "poświadczenia/sekrety — kopia z definicji ich nie niesie; po restore operator wpisuje klucze na nowo",
  ShippingProfile: "dane osobowe (adres/telefon/e-mail/nick darczyńcy) — kopia z definicji ich nie niesie",
  SocialLink: "dane osobowe (adres/telefon/e-mail/nick darczyńcy) — kopia z definicji ich nie niesie",
  SongRequest: "historia/stan gry użytkowników — kopia niesie SALDA (`users`), nie przebieg rozgrywki",
  StreamAlert: "wolumen/efemeryda — odtwarza się sama, a w kopii tylko puchnie",
  StreamSession: "wolumen/efemeryda — odtwarza się sama, a w kopii tylko puchnie",
  StreamlabsConnection: "poświadczenia/sekrety — kopia z definicji ich nie niesie; po restore operator wpisuje klucze na nowo",
  SupportTicket: "dane osobowe (adres/telefon/e-mail/nick darczyńcy) — kopia z definicji ich nie niesie",
  Transaction: "historia/stan gry użytkowników — kopia niesie SALDA (`users`), nie przebieg rozgrywki",
  TriviaAnswer: "historia/stan gry użytkowników — kopia niesie SALDA (`users`), nie przebieg rozgrywki",
  TwitchEvent: "wolumen/efemeryda — odtwarza się sama, a w kopii tylko puchnie",
  TwitchEventSubscription: "poświadczenia/sekrety — kopia z definicji ich nie niesie; po restore operator wpisuje klucze na nowo",
  TwitchStreamerToken: "poświadczenia/sekrety — kopia z definicji ich nie niesie; po restore operator wpisuje klucze na nowo",
  UserAchievement: "historia/stan gry użytkowników — kopia niesie SALDA (`users`), nie przebieg rozgrywki",
  UserCollectible: "historia/stan gry użytkowników — kopia niesie SALDA (`users`), nie przebieg rozgrywki",
  UserSeasonProgress: "historia/stan gry użytkowników — kopia niesie SALDA (`users`), nie przebieg rozgrywki",
  UserSeasonRewardClaim: "historia/stan gry użytkowników — kopia niesie SALDA (`users`), nie przebieg rozgrywki",
  UserTask: "historia/stan gry użytkowników — kopia niesie SALDA (`users`), nie przebieg rozgrywki",
  VerificationToken: "poświadczenia/sekrety — kopia z definicji ich nie niesie; po restore operator wpisuje klucze na nowo",
  WheelSpin: "historia/stan gry użytkowników — kopia niesie SALDA (`users`), nie przebieg rozgrywki",
  YouTubeEvent: "wolumen/efemeryda — odtwarza się sama, a w kopii tylko puchnie",
  YouTubeStreamerToken: "poświadczenia/sekrety — kopia z definicji ich nie niesie; po restore operator wpisuje klucze na nowo",
};

/**
 * Pola `Tenant`, które trafiają do kopii — **lista pozytywna, nie `omit`**.
 *
 * @remarks
 * Celowo `select`, a nie „weź wszystko bez tych pięciu": przy `omit` KAŻDY nowy sekret dodany do
 * modelu wjechałby do kopii sam, po cichu. Poza kopią zostają `botSecret`, `streamDeckToken`,
 * `stripeCustomerId`, `stripeSubscriptionId` i `ownerEmail`. `tokenName`/`tokenSymbol` to **nazwa
 * waluty portalu**, nie poświadczenie — i to jest dokładnie to, co restore musi odtworzyć.
 */
const POLA_TENANTA = {
  id: true, slug: true, name: true, shortName: true,
  brandColor: true, surfaceColor: true, textColor: true, fontFamily: true,
  logoUrl: true, bgImageUrl: true, domain: true,
  tokenName: true, tokenSymbol: true, companionDefaultName: true,
  socialLinks: true, hubEnabled: true, hubBio: true, hubLinks: true,
  disabledFeatures: true, dailyChipsAmount: true,
  supportAlertMode: true, supportHeading: true, supportIntro: true, supportThanks: true,
  timezone: true, ownerHandle: true, plan: true, planExpiresAt: true, ownerUserId: true,
  setupCompletedAt: true, setupDismissedAt: true, createdAt: true, updatedAt: true,
} as const;

export async function buildBackup(): Promise<Record<string, unknown>> {
  const [
    shopItems, events, achievements, chatCommands, chatTimers, faqResponses,
    welcomeConfig, botConfig, scheduleSlots, subathon, moderationConfig,
    seasons, seasonRewards, streamAlertSettings, alertTypeConfigs, streamCodes,
    codeDropConfig, polls, predictions, streamGoals, chatOverlayConfig,
    customAlerts, customWidgets, users,
    tenants, tenantCopy, overlayScenes, obsRules, goveeRules, hueRules, wheelConfig, soundRewards, paymentMethods, sponsors, collectibles, triviaQuestions, penaltyConfig, penalties, games, clipDirectorConfig, supportGoals, bounties, dailyTasks, streamDrops, songRequestBans,
  ] = await Promise.all([
    prisma.shopItem.findMany(),
    prisma.event.findMany(),
    prisma.achievement.findMany(),
    prisma.chatCommand.findMany(),
    prisma.chatTimer.findMany(),
    prisma.faqResponse.findMany(),
    prisma.welcomeConfig.findMany(),
    prisma.botConfig.findMany(),
    prisma.streamScheduleSlot.findMany(),
    prisma.subathon.findMany(),
    prisma.moderationConfig.findMany(),
    prisma.season.findMany(),
    prisma.seasonReward.findMany(),
    prisma.streamAlertSettings.findMany(),
    prisma.alertTypeConfig.findMany(),
    prisma.streamCode.findMany(),
    prisma.codeDropConfig.findMany(),
    prisma.poll.findMany(),
    prisma.prediction.findMany(),
    prisma.streamGoal.findMany(),
    prisma.chatOverlayConfig.findMany(),
    prisma.customAlert.findMany(),
    prisma.customWidget.findMany(),
    prisma.user.findMany({
      select: {
        id: true, username: true, displayName: true, tokens: true, totalEarned: true,
        totalSpent: true, level: true, xp: true, streak: true, isAdmin: true,
        isModerator: true, isDonator: true, createdAt: true,
      },
    }),
    prisma.tenant.findMany({ select: POLA_TENANTA }),
    prisma.tenantCopy.findMany(),
    prisma.overlayScene.findMany(),
    prisma.obsRule.findMany(),
    prisma.goveeRule.findMany(),
    prisma.hueRule.findMany(),
    prisma.wheelConfig.findMany(),
    prisma.soundReward.findMany(),
    prisma.paymentMethod.findMany(),
    prisma.sponsor.findMany(),
    prisma.collectible.findMany(),
    prisma.triviaQuestion.findMany(),
    prisma.penaltyConfig.findMany(),
    prisma.penalty.findMany(),
    prisma.game.findMany(),
    prisma.clipDirectorConfig.findMany(),
    prisma.supportGoal.findMany(),
    prisma.bounty.findMany(),
    prisma.dailyTask.findMany(),
    prisma.streamDrop.findMany(),
    prisma.songRequestBan.findMany(),
  ]);

  return {
    _meta: {
      app: "ghost-empire",
      exportedAt: new Date().toISOString(),
      version: 2,
      note: "Konfiguracja portali + katalogi + salda użytkowników. BEZ sekretów/PII (bez tokenów auth, e-maili, sesji, logów).",
      models: MODELE_W_KOPII.length,
    },
    shopItems, events, achievements, chatCommands, chatTimers, faqResponses,
    welcomeConfig, botConfig, scheduleSlots, subathon, moderationConfig,
    seasons, seasonRewards, streamAlertSettings, alertTypeConfigs, streamCodes,
    codeDropConfig, polls, predictions, streamGoals, chatOverlayConfig,
    customAlerts, customWidgets, users,
    tenants, tenantCopy, overlayScenes, obsRules, goveeRules, hueRules, wheelConfig, soundRewards, paymentMethods, sponsors, collectibles, triviaQuestions, penaltyConfig, penalties, games, clipDirectorConfig, supportGoals, bounties, dailyTasks, streamDrops, songRequestBans,
  };
}
