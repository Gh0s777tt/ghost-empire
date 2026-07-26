// src/lib/extensions.ts
// Single source of truth for the browser-extension promo (tiles on /rozszerzenia + home
// + the companion info panel). Bilingual inline (PL/EN) so it needs NO locale-file changes.
//
// WHITE-LABEL: copy must NOT bake in the founder currency. Use the placeholders %token%
// (full currency name → tenant.tokenName) and %sym% (symbol → tenant.tokenSymbol); the
// render layer (ExtensionsSection / ExtensionHint / /rozszerzenia) fills them per tenant
// via useTenantBranding()/getCurrentTenant(). The extension NAMES (NX Companion, NX Chat
// Tools) are the actual E-Forge product names and stay literal on every portal.
//
// Not published to the stores yet (store submission needs the owner's Chrome/AMO accounts):
// leave chromeUrl/firefoxUrl = null → the card renders a "Wkrótce / Coming soon" badge.
// When published, just fill the URLs here and the cards activate themselves — no other edits.

export type Bi = { pl: string; en: string };

/** Fill white-label placeholders — `%token%` → tenant currency name, `%sym%` → symbol. */
export function fillBranding(s: string, b: { tokenName: string; tokenSymbol: string }): string {
  return s.replaceAll("%token%", b.tokenName).replaceAll("%sym%", b.tokenSymbol);
}

export type Extension = {
  id: string;
  emoji: string;
  name: string;
  /**
   * What the user actually installs. A browser extension comes from a store; the Discord bot is
   * INVITED to a server instead, so it must not render "add to Chrome" buttons it can never satisfy.
   */
  kind: "extension" | "discord-bot";
  tagline: Bi;
  features: Bi[];
  /** Store URLs — null until published (renders a "coming soon" badge). Always null for a bot. */
  chromeUrl: string | null;
  firefoxUrl: string | null;
  /** discord-bot only: the one-click invite, and the self-serve dashboard for server admins. */
  inviteUrl?: string | null;
  dashboardUrl?: string | null;
  /** Accent color for the card (matches the product's identity). */
  accent: string;
};

export const EXTENSIONS: Extension[] = [
  {
    id: "e-bot",
    emoji: "🤖",
    name: "E-Bot",
    kind: "discord-bot",
    tagline: {
      pl: "Discordowe ramię portalu: %token% za aktywność, powiadomienia live i anti-nuke.",
      en: "The portal's Discord arm: %token% for activity, live alerts and anti-nuke.",
    },
    features: [
      // Verified against the bot's own README — this is the one feature that ties it to the portal:
      // Discord activity is inside the closed catalogue of GT sources (terms §8 ust. 1 lit. e), and
      // `/link` is what connects a Discord account to a portal account.
      { pl: "%sym% za wiadomości i rozmowy głosowe; /link łączy Discorda z kontem w portalu", en: "%sym% for messages and voice; /link connects Discord to the portal account" },
      { pl: "Powiadomienia live: Twitch, Kick, Rumble i YouTube, w kolorach platform", en: "Live alerts for Twitch, Kick, Rumble and YouTube, in each platform's colours" },
      { pl: "Anti-nuke i moderacja: ochrona ról i kanałów, automod, tickety, logi", en: "Anti-nuke and moderation: role/channel protection, automod, tickets, logs" },
      { pl: "Własny panel: personalizacja bota, statystyki, izolacja per serwer", en: "Its own dashboard: bot personalisation, stats, per-server isolation" },
    ],
    chromeUrl: null,
    firefoxUrl: null,
    // Left null on purpose: the invite URL embeds a Discord application id, which is per-deployment.
    // A wrong one sends the streamer to an error page, so it activates only once the owner fills it.
    inviteUrl: null,
    dashboardUrl: "https://e-bot-dc.vercel.app",
    accent: "#5865f2", // Discord blurple
  },
  {
    id: "nx-companion",
    emoji: "🪟",
    name: "NX Companion",
    kind: "extension",
    tagline: {
      pl: "Twoje %token%, questy i drop-code'y podczas oglądania streama.",
      en: "Your %token%, quests and drop-codes while you watch the stream.",
    },
    features: [
      { pl: "Saldo %sym% i kompan jako overlay na Twitchu/Kicku", en: "%sym% balance & companion overlay on Twitch/Kick" },
      { pl: "Odbiór dziennych questów bez wchodzenia na portal", en: "Claim daily quests without opening the portal" },
      { pl: "Drop-code'y i sezon (battle pass) w locie", en: "Drop-codes and season (battle pass) on the fly" },
    ],
    chromeUrl: null,
    firefoxUrl: null,
    accent: "#8b5cf6",
  },
  {
    id: "nx-chat-tools",
    emoji: "🛡️",
    name: "NX Chat Tools",
    kind: "extension",
    tagline: {
      pl: "Narzędzia moderacji i emotki 7TV na czatach Twitch i Kick.",
      en: "Moderation tools and 7TV emotes for Twitch and Kick chats.",
    },
    features: [
      { pl: "Szybkie akcje moderacji przy wiadomości (timeout/ban/usuń)", en: "Quick per-message mod actions (timeout/ban/delete)" },
      { pl: "Emotki 7TV / BTTV / FFZ renderowane na żywo", en: "7TV / BTTV / FFZ emotes rendered live" },
      { pl: "Command palette ⌘K + podświetlenia i statystyki czatu", en: "Command palette ⌘K + chat highlights & stats" },
    ],
    chromeUrl: null,
    firefoxUrl: null,
    accent: "#f59e0b",
  },
];
