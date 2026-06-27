// src/lib/command-reference.ts
// Curated map of feature → chat/bot commands (#703). Commands are literal triggers (not
// translated); descriptions are i18n keys in the `commandHelp` namespace. Rendered by the
// reusable <CommandHelp feature="…"> popover on viewer pages + admin sections, so anyone can
// see "what can I type for this feature and what does it do". Authoritative strings mirror the
// bot's actual message handlers (ghost-empire-chat: gtGames/gtDuel/heist/songRequest/aiCommands/
// raffle) + /about: !slots/!coinflip/!roulette, !duel/!accept, !heist, !sr, @bot/!imagine, and the
// chat-keyword raffle. NOTE: predictions/trivia/wheel are placed on the WEB (no viewer chat
// command), so they intentionally have no entry here.
export type FeatureCmd = { cmd: string; descKey: string };

export const FEATURE_COMMANDS: Record<string, FeatureCmd[]> = {
  // Casino / GT mini-games hub (/kasyno) — also driven from chat.
  kasyno: [
    { cmd: "!slots <kwota>", descKey: "cmd_slots" },
    { cmd: "!coinflip <kwota>", descKey: "cmd_coinflip" },
    { cmd: "!roulette <kwota> <red|black|0-36>", descKey: "cmd_roulette" },
    { cmd: "!duel <kwota>", descKey: "cmd_duelOpen" },
    { cmd: "!duel @nick <kwota>", descKey: "cmd_duelTarget" },
    { cmd: "!accept", descKey: "cmd_accept" },
    { cmd: "!heist <kwota>", descKey: "cmd_heist" },
  ],
  // Song requests overlay/queue.
  songs: [{ cmd: "!sr <link / tytuł>", descKey: "cmd_sr" }],
  // AI bot (needs the streamer's AI key enabled).
  ai: [
    { cmd: "@bot <pytanie>", descKey: "cmd_bot" },
    { cmd: "!imagine <opis>", descKey: "cmd_imagine" },
  ],
  // Chat-keyword raffle (#673) — viewers enter by typing the streamer's announced keyword,
  // not a fixed command, so the "trigger" is the keyword itself.
  raffle: [{ cmd: "<słowo-klucz>", descKey: "cmd_raffleKeyword" }],
};
