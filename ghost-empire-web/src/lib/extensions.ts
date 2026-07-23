// src/lib/extensions.ts
// Single source of truth for the browser-extension promo (tiles on /rozszerzenia + home
// + the companion info panel). Bilingual inline (PL/EN) so it needs NO locale-file changes.
//
// Not published to the stores yet (store submission needs the owner's Chrome/AMO accounts):
// leave chromeUrl/firefoxUrl = null → the card renders a "Wkrótce / Coming soon" badge.
// When published, just fill the URLs here and the cards activate themselves — no other edits.

export type Bi = { pl: string; en: string };

export type Extension = {
  id: string;
  emoji: string;
  name: string;
  tagline: Bi;
  features: Bi[];
  /** Store URLs — null until published (renders a "coming soon" badge). */
  chromeUrl: string | null;
  firefoxUrl: string | null;
  /** Accent color for the card (matches the extension's identity). */
  accent: string;
};

export const EXTENSIONS: Extension[] = [
  {
    id: "nx-companion",
    emoji: "🪟",
    name: "NX Companion",
    tagline: {
      pl: "Twoje Ghost Tokens, questy i drop-code'y podczas oglądania streama.",
      en: "Your Ghost Tokens, quests and drop-codes while you watch the stream.",
    },
    features: [
      { pl: "Saldo GT i kompan jako overlay na Twitchu/Kicku", en: "GT balance & companion overlay on Twitch/Kick" },
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
