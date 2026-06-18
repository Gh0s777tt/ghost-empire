// prisma/seed.ts
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding database...");

  // Multi-tenant: seeded achievements belong to the default "ghost-empire" tenant.
  // (Other models with a nullable tenantId are attached by scripts/backfill-tenant.ts.)
  const tenant = await prisma.tenant.upsert({
    where: { slug: "ghost-empire" },
    update: {},
    create: { slug: "ghost-empire", name: "GH0ST EMPIRE", shortName: "Ghost Empire", brandColor: "#E50914" },
  });

  // ---- ACHIEVEMENTS ----
  const achievements = [
    { code: "first_login",    name: "Pierwsze Kroki",      icon: "👋", rarity: "common",    description: "Zaloguj się po raz pierwszy",              triggerType: "manual",         triggerValue: 1 },
    { code: "first_sub",      name: "Pierwszy Sub",        icon: "⚡", rarity: "common",    description: "Zostań subem Ghosta",                     triggerType: "manual",         triggerValue: 1 },
    { code: "first_drop",     name: "Pierwszy Drop",       icon: "🎁", rarity: "common",    description: "Odbierz pierwszy stream drop",             triggerType: "manual",         triggerValue: 1 },
    { code: "level_5",        name: "Widmo",               icon: "🌫️", rarity: "common",    description: "Wbij Level 5",                            triggerType: "level",          triggerValue: 5 },
    { code: "level_15",       name: "Specter",             icon: "👤", rarity: "common",    description: "Wbij Level 15",                           triggerType: "level",          triggerValue: 15 },
    { code: "level_30",       name: "Haunt",               icon: "👻", rarity: "rare",      description: "Wbij Level 30",                           triggerType: "level",          triggerValue: 30 },
    { code: "level_50",       name: "Półwiekowy Duch",     icon: "🔥", rarity: "rare",      description: "Wbij Level 50",                           triggerType: "level",          triggerValue: 50 },
    { code: "level_75",       name: "Phantom Lord",        icon: "💀", rarity: "epic",      description: "Wbij Level 75",                           triggerType: "level",          triggerValue: 75 },
    { code: "level_100",      name: "GH0ST GOD",           icon: "👁️", rarity: "legendary", description: "Wbij maksymalny Level 100",               triggerType: "level",          triggerValue: 100 },
    { code: "streak_7",       name: "Tygodniowy Rytuał",   icon: "🗓️", rarity: "common",    description: "7 dni z rzędu",                           triggerType: "streak",         triggerValue: 7 },
    { code: "streak_30",      name: "Miesięczna Obsesja",  icon: "🎯", rarity: "rare",      description: "30 dni z rzędu",                          triggerType: "streak",         triggerValue: 30 },
    { code: "streak_100",     name: "Setka Streak",        icon: "🌋", rarity: "legendary", description: "100 dni z rzędu",                         triggerType: "streak",         triggerValue: 100 },
    { code: "messages_100",   name: "Gaduła",              icon: "💬", rarity: "common",    description: "Napisz 100 wiadomości",                   triggerType: "messages",       triggerValue: 100 },
    { code: "messages_1000",  name: "Kronikarz",           icon: "📜", rarity: "rare",      description: "Napisz 1000 wiadomości",                  triggerType: "messages",       triggerValue: 1000 },
    { code: "tokens_10000",   name: "Zbieracz Duchów",     icon: "💰", rarity: "common",    description: "Zbierz 10,000 Ghost Tokens",              triggerType: "tokens_earned",  triggerValue: 10000 },
    { code: "tokens_100000",  name: "Bogacz",              icon: "💎", rarity: "rare",      description: "Zbierz 100,000 Ghost Tokens",             triggerType: "tokens_earned",  triggerValue: 100000 },
    { code: "tokens_1000000", name: "Milioner",            icon: "🏦", rarity: "legendary", description: "Zbierz 1,000,000 Ghost Tokens",           triggerType: "tokens_earned",  triggerValue: 1000000 },
    { code: "big_spender",    name: "Wielki Wydawca",      icon: "🛍️", rarity: "epic",      description: "Wydaj 50,000 Ghost Tokens w sklepie",     triggerType: "manual",         triggerValue: 50000 },
    { code: "og_member",      name: "OG Member",           icon: "👑", rarity: "legendary", description: "Jeden z pierwszych 100 userów",           triggerType: "manual",         triggerValue: 1 },
    { code: "dual_supporter", name: "Dual Supporter",      icon: "🌟", rarity: "epic",      description: "Sub na Twitch i Kick jednocześnie",       triggerType: "manual",         triggerValue: 1 },
    { code: "event_winner",   name: "Zwycięzca Eventu",    icon: "🏆", rarity: "rare",      description: "Wygraj giveaway, konkurs lub raffle",     triggerType: "manual",         triggerValue: 1 },
    { code: "social_linked",  name: "Towarzyska Dusza",    icon: "🦋", rarity: "rare",      description: "Połącz 3 platformy z profilem",          triggerType: "manual",         triggerValue: 3 },

    // Stream-event triggers (Phase 3+ — auto-granted by lib/achievements.ts)
    // Donations (Streamlabs + YouTube super chats)
    { code: "donation_first",    name: "Pierwsza Donacja",      icon: "❤️", rarity: "common",    description: "Zrób pierwszą donację",                     triggerType: "donations_count",       triggerValue: 1,   tokenReward: 1000 },
    { code: "donation_5",        name: "Wsparcie x5",            icon: "💝", rarity: "rare",      description: "5 donacji",                                  triggerType: "donations_count",       triggerValue: 5,   tokenReward: 2500 },
    { code: "donation_25",       name: "Stały Patron",           icon: "💞", rarity: "epic",      description: "25 donacji",                                 triggerType: "donations_count",       triggerValue: 25,  tokenReward: 10000 },
    { code: "donor_50pln",       name: "Pierwsze 50 PLN",        icon: "💵", rarity: "common",    description: "Zsumowane donacje 50 PLN",                  triggerType: "donations_amount_pln",  triggerValue: 50,   tokenReward: 1000 },
    { code: "donor_500pln",      name: "Pół Tysiąca",            icon: "💰", rarity: "epic",      description: "Zsumowane donacje 500 PLN",                 triggerType: "donations_amount_pln",  triggerValue: 500,  tokenReward: 10000 },
    { code: "donor_1000pln",     name: "Tysiącznik",             icon: "🪙", rarity: "legendary", description: "Zsumowane donacje 1000 PLN",                triggerType: "donations_amount_pln",  triggerValue: 1000, tokenReward: 25000 },

    // Twitch subs received (becoming a sub of Ghost's channel)
    { code: "twitch_sub_1",      name: "Pierwszy Twitch Sub",    icon: "💜", rarity: "common",    description: "Zostań subem na Twitchu",                    triggerType: "twitch_sub_received",   triggerValue: 1,   tokenReward: 500 },
    { code: "twitch_sub_3",      name: "Stała Załoga (TW)",      icon: "🔮", rarity: "rare",      description: "3 sub-y / odnowienia na Twitchu",            triggerType: "twitch_sub_received",   triggerValue: 3,   tokenReward: 2000 },
    { code: "twitch_sub_12",     name: "Rok Werności (TW)",      icon: "👑", rarity: "legendary", description: "12 miesięcy subów na Twitchu",               triggerType: "twitch_sub_received",   triggerValue: 12,  tokenReward: 15000 },

    // Kick subs received
    { code: "kick_sub_1",        name: "Pierwszy Kick Sub",      icon: "💚", rarity: "common",    description: "Zostań subem na Kicku",                      triggerType: "kick_sub_received",     triggerValue: 1,   tokenReward: 500 },
    { code: "kick_sub_3",        name: "Stała Załoga (Kick)",    icon: "🍀", rarity: "rare",      description: "3 sub-y / odnowienia na Kicku",              triggerType: "kick_sub_received",     triggerValue: 3,   tokenReward: 2000 },
    { code: "kick_sub_12",       name: "Rok Werności (Kick)",    icon: "🌳", rarity: "legendary", description: "12 miesięcy subów na Kicku",                 triggerType: "kick_sub_received",     triggerValue: 12,  tokenReward: 15000 },

    // Gift subs given (Twitch + Kick combined)
    { code: "gifter_1",          name: "Mały Mikołaj",           icon: "🎁", rarity: "common",    description: "Pierwszy gifted sub",                       triggerType: "gift_subs_given",       triggerValue: 1,   tokenReward: 500 },
    { code: "gifter_10",         name: "Hojny",                  icon: "🎀", rarity: "rare",      description: "10 gifted subs",                            triggerType: "gift_subs_given",       triggerValue: 10,  tokenReward: 5000 },
    { code: "gifter_50",         name: "Sponsor Społeczności",   icon: "🎄", rarity: "epic",      description: "50 gifted subs",                            triggerType: "gift_subs_given",       triggerValue: 50,  tokenReward: 25000 },

    // Bits cheered
    { code: "cheer_100",         name: "Pierwszy Cheer",         icon: "💎", rarity: "common",    description: "100 bitów łącznie",                          triggerType: "bits_cheered",          triggerValue: 100,    tokenReward: 500 },
    { code: "cheer_1000",        name: "Diament",                icon: "💍", rarity: "rare",      description: "1,000 bitów łącznie",                        triggerType: "bits_cheered",          triggerValue: 1000,   tokenReward: 3000 },
    { code: "cheer_10000",       name: "Wzbogacacz",             icon: "💠", rarity: "epic",      description: "10,000 bitów łącznie",                       triggerType: "bits_cheered",          triggerValue: 10000,  tokenReward: 15000 },

    // Super chats received
    { code: "superchat_first",   name: "Pierwszy Super Chat",    icon: "⭐", rarity: "common",    description: "Wyślij pierwszego YT Super Chata",          triggerType: "super_chats_received",  triggerValue: 1,   tokenReward: 1000 },
    { code: "superchat_10",      name: "Gwiazda YT",             icon: "🌟", rarity: "rare",      description: "10 Super Chats",                            triggerType: "super_chats_received",  triggerValue: 10,  tokenReward: 5000 },

    // YT membership
    { code: "yt_member_first",   name: "YT Member",              icon: "📺", rarity: "common",    description: "Zostań YouTube członkiem",                  triggerType: "yt_member",             triggerValue: 1,   tokenReward: 1500 },

    // Drops claimed
    { code: "drop_first",        name: "Łapacz Dropów",          icon: "🎯", rarity: "common",    description: "Złap pierwszy stream drop",                 triggerType: "drops_claimed",         triggerValue: 1,   tokenReward: 200 },
    { code: "drop_10",           name: "Czujka",                 icon: "🦅", rarity: "rare",      description: "10 złapanych dropów",                       triggerType: "drops_claimed",         triggerValue: 10,  tokenReward: 2000 },
    { code: "drop_50",           name: "Drop Master",            icon: "🏹", rarity: "epic",      description: "50 złapanych dropów",                       triggerType: "drops_claimed",         triggerValue: 50,  tokenReward: 10000 },

    // Events won
    { code: "event_win_1",       name: "Pierwsza Wygrana",       icon: "🏆", rarity: "common",    description: "Wygraj swój pierwszy event",                triggerType: "events_won",            triggerValue: 1,   tokenReward: 1000 },
    { code: "event_win_5",       name: "Szczęściarz",            icon: "🍀", rarity: "rare",      description: "Wygraj 5 eventów",                          triggerType: "events_won",            triggerValue: 5,   tokenReward: 5000 },
    { code: "event_win_10",      name: "Króliczek Losu",         icon: "🐇", rarity: "epic",      description: "Wygraj 10 eventów",                         triggerType: "events_won",            triggerValue: 10,  tokenReward: 15000 },

    // Shop purchases
    { code: "shop_1",            name: "Pierwszy Zakup",         icon: "🛒", rarity: "common",    description: "Pierwszy zakup w sklepie",                  triggerType: "shop_purchases",        triggerValue: 1,   tokenReward: 200 },
    { code: "shop_10",           name: "Stały Klient",           icon: "🏪", rarity: "rare",      description: "10 zakupów w sklepie",                      triggerType: "shop_purchases",        triggerValue: 10,  tokenReward: 3000 },

    // Platforms linked
    { code: "linked_2",          name: "Dwa Konta",              icon: "🔗", rarity: "common",    description: "Połącz drugą platformę OAuth",              triggerType: "platforms_linked",      triggerValue: 2,   tokenReward: 500 },
    { code: "linked_4",          name: "Wszystkie Platformy",    icon: "🌐", rarity: "epic",      description: "Połącz 4 platformy (TW/Kick/DC/Google)",    triggerType: "platforms_linked",      triggerValue: 4,   tokenReward: 5000 },

    // Prestiż (Phantom Ascension) — gwiazdki ✦ za lifetime XP ponad max level
    { code: "prestige_1",        name: "Wniebowstąpienie",       icon: "✦", rarity: "epic",      description: "Zdobądź pierwszą gwiazdkę prestiżu ✦",       triggerType: "prestige",              triggerValue: 1,   tokenReward: 10000 },
    { code: "prestige_5",        name: "Pięć Gwiazd",            icon: "✦", rarity: "legendary", description: "Zdobądź 5 gwiazdek prestiżu ✦",              triggerType: "prestige",              triggerValue: 5,   tokenReward: 50000 },

    // Pojedynki PvP (!duel) — wygrane walki
    { code: "duel_win_1",        name: "Pierwsza Krew",          icon: "⚔️", rarity: "common",    description: "Wygraj pierwszy pojedynek",                  triggerType: "duels_won",             triggerValue: 1,   tokenReward: 500 },
    { code: "duel_win_10",       name: "Pojedynkowicz",          icon: "⚔️", rarity: "rare",      description: "Wygraj 10 pojedynków",                       triggerType: "duels_won",             triggerValue: 10,  tokenReward: 5000 },
    { code: "duel_win_50",       name: "Gladiator",              icon: "🗡️", rarity: "epic",      description: "Wygraj 50 pojedynków",                       triggerType: "duels_won",             triggerValue: 50,  tokenReward: 20000 },

    // Kasyno GT (sloty / coinflip) — liczba gier
    { code: "casino_first",      name: "Pierwszy Zakład",        icon: "🎰", rarity: "common",    description: "Zagraj pierwszy raz w kasynie GT",           triggerType: "casino_plays",          triggerValue: 1,   tokenReward: 200 },
    { code: "casino_100",        name: "Hazardzista",            icon: "🎲", rarity: "rare",      description: "Zagraj 100 razy w kasynie GT",               triggerType: "casino_plays",          triggerValue: 100, tokenReward: 5000 },

    // Ghost Companion (pet) + klany
    { code: "companion_spark",   name: "Iskra Życia",            icon: "✨", rarity: "common",    description: "Nakarm widmowego kompana po raz pierwszy",        triggerType: "companion_xp",          triggerValue: 1,     tokenReward: 200 },
    { code: "companion_ghost",   name: "Pełne Widmo",            icon: "👻", rarity: "rare",      description: "Wyhoduj kompana do etapu Duch (2000 XP)",         triggerType: "companion_xp",          triggerValue: 2000,  tokenReward: 3000 },
    { code: "companion_phantom", name: "Władca Widm",            icon: "👑", rarity: "legendary", description: "Wyhoduj kompana do etapu Władca Widm (40000 XP)", triggerType: "companion_xp",          triggerValue: 40000, tokenReward: 30000 },
    { code: "clan_member",       name: "Drużynowy",              icon: "🛡️", rarity: "common",    description: "Dołącz lub załóż klan",                           triggerType: "clans_joined",          triggerValue: 1,     tokenReward: 500 },
    { code: "clan_patron",       name: "Mecenas Klanu",          icon: "💰", rarity: "epic",      description: "Wpłać 10 000 GT do skarbca klanu jednorazowo",    triggerType: "clan_contributed",      triggerValue: 10000, tokenReward: 5000 },
  ];

  for (const a of achievements) {
    await prisma.achievement.upsert({
      where: { tenantId_code: { tenantId: tenant.id, code: a.code } },
      update: a,
      create: { ...a, tenantId: tenant.id },
    });
  }
  console.log(`✅ ${achievements.length} achievements seeded`);

  // ---- DAILY TASKS ----
  const tasks = [
    {
      code: "daily_messages",
      text: "Napisz 10 wiadomości na Discord",
      textEn: "Send 10 messages on Discord",
      target: 10,
      reward: 250,
      triggerType: "messages",
    },
    {
      code: "daily_voice",
      text: "Spędź 30 min na voice",
      textEn: "Spend 30 minutes in voice chat",
      target: 30,
      reward: 500,
      triggerType: "voice_minutes",
    },
    {
      code: "daily_drop",
      text: "Odbierz kod drop podczas live",
      textEn: "Claim a drop code during live stream",
      target: 1,
      reward: 1000,
      triggerType: "drop_code",
    },
  ];

  for (const t of tasks) {
    await prisma.dailyTask.upsert({
      where: { code: t.code },
      update: t,
      create: t,
    });
  }
  console.log(`✅ ${tasks.length} daily tasks seeded`);

  // ---- SHOP ITEMS ----
  const shopItems = [
    {
      name: "Klucz Steam — Cyberpunk 2077",
      description: "Klucz na Steam. Aktywacja po odbiorze przez ticket Discord. Dostarczamy w ciągu 24h.",
      category: "games",
      price: 100000,
      imageEmoji: "🎮",
      stock: 3,
      totalStock: 5,
      hot: true,
      sortOrder: 1,
    },
    {
      name: "Skin CS2 — AK-47 Redline (Field-Tested)",
      description: "Skin wysyłany trade-offerem ze Steama. Napisz swoje Steam Trade URL w tickecie.",
      category: "skins",
      price: 75000,
      imageEmoji: "🎯",
      stock: 2,
      totalStock: 2,
      hot: false,
      sortOrder: 2,
    },
    {
      name: "Gifted Twitch Sub (1 miesiąc T1)",
      description: "Otrzymasz gifted sub T1. Napisz swój nick Twitch w tickecie.",
      category: "subs",
      price: 50000,
      imageEmoji: "💜",
      stock: 8,
      totalStock: 10,
      hot: true,
      sortOrder: 3,
    },
    {
      name: "Custom Kolor Nicka Discord (30 dni)",
      description: "Wybierasz dowolny kolor HEX, Ghost tworzy dla Ciebie customową rolę na serwerze.",
      category: "cosmetic",
      price: 8000,
      imageEmoji: "🎨",
      stock: -1,
      totalStock: -1,
      hot: false,
      sortOrder: 4,
    },
    {
      name: "Shoutout od Ghosta (live + Discord)",
      description: "Ghost zrobi personalny shoutout podczas najbliższego streamu i w ogłoszeniach Discord. W ciągu 7 dni.",
      category: "experience",
      price: 15000,
      imageEmoji: "📢",
      stock: 5,
      totalStock: 5,
      hot: true,
      sortOrder: 5,
    },
    {
      name: "Pin wiadomości (1x)",
      description: "Twoja wiadomość zostanie pinowana w wybranym przez Ciebie kanale Discord na 7 dni.",
      category: "cosmetic",
      price: 10000,
      imageEmoji: "📌",
      stock: -1,
      totalStock: -1,
      hot: false,
      sortOrder: 6,
    },
    {
      name: "Klucz Steam — Hogwarts Legacy",
      description: "Klucz aktywacyjny Steam. Dostarczamy w ciągu 24h przez ticket.",
      category: "games",
      price: 80000,
      imageEmoji: "🧙",
      stock: 1,
      totalStock: 2,
      hot: false,
      sortOrder: 7,
    },
    {
      name: "Voice 1-on-1 z Ghostem (15 min)",
      description: "Prywatna rozmowa na Discord Voice z Ghostem. Termin do uzgodnienia. Tylko dla T3 / 12mc+ / DUAL SUPPORTER.",
      category: "experience",
      price: 150000,
      imageEmoji: "🎙️",
      stock: 1,
      totalStock: 1,
      hot: true,
      requiresSubTier: "T3",
      sortOrder: 8,
    },
    {
      name: "Mystery Box 🎁",
      description: "Losowy klucz Steam do gry o wartości 20-80 zł. Niespodzianka! Może być cokolwiek.",
      category: "games",
      price: 25000,
      imageEmoji: "🎁",
      stock: -1,
      totalStock: -1,
      hot: false,
      sortOrder: 9,
    },
    {
      name: "Custom Emoji Request",
      description: "Ghost doda do serwera Discord emoji wybrane przez Ciebie (lub któreś z Twoich propozycji). Wymagane: przygotuj plik PNG 128x128.",
      category: "cosmetic",
      price: 30000,
      imageEmoji: "😈",
      stock: 10,
      totalStock: 15,
      hot: false,
      sortOrder: 10,
    },
    {
      name: "Bilet na event live",
      description: "Wejście na przyszłe spotkanie offline z Ghost Empire w Polsce. Data i lokalizacja ogłaszane osobno.",
      category: "experience",
      price: 200000,
      imageEmoji: "🎟️",
      stock: 3,
      totalStock: 5,
      hot: true,
      sortOrder: 11,
    },
    {
      name: "Skin CS2 — M4A4 Howl (LEGENDARNY)",
      description: "Niezwykle rzadki skin. Wysyłany trade-offerem. Dla prawdziwych zbieraczy.",
      category: "skins",
      price: 1500000,
      imageEmoji: "🔥",
      stock: 0,
      totalStock: 1,
      hot: false,
      sortOrder: 12,
    },
  ];

  await prisma.shopItem.deleteMany();
  await prisma.shopItem.createMany({ data: shopItems });
  console.log(`✅ ${shopItems.length} shop items seeded`);

  // ---- EVENTS ----
  const now = new Date();
  const events = [
    {
      type: "happy_hour",
      name: "HAPPY HOUR ×2",
      description: "Wszystkie Ghost Tokens zarobiasz w podwójnej ilości! Aktywny podczas live.",
      multiplier: 2.0,
      active: true,
      startsAt: new Date(now.getTime() + 1 * 60 * 60 * 1000),
      endsAt: new Date(now.getTime() + 3 * 60 * 60 * 1000),
    },
    {
      type: "giveaway",
      name: "GIVEAWAY: Klucz Cyberpunk 2077",
      description: "Weź udział klikając przycisk! Losowanie na koniec streamu. Wymóg: Subskrybent dowolnej platformy.",
      prize: "Cyberpunk 2077 + Phantom Liberty DLC",
      winnersCount: 1,
      requirement: "Aktywny subskrybent (Twitch lub Kick)",
      active: true,
      endsAt: new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000),
    },
    {
      type: "raffle",
      name: "WEEKLY RAFFLE — Skin CS2",
      description: "Kup bilety za Ghost Tokens. Każdy bilet = 1 szansa. Losowanie w niedzielę 20:00.",
      prize: "AK-47 Asiimov (Field-Tested)",
      winnersCount: 1,
      ticketPrice: 500,
      maxTicketsPerUser: 20,
      active: true,
      endsAt: new Date(now.getTime() + 4 * 24 * 60 * 60 * 1000),
    },
    {
      type: "contest",
      name: "KONKURS: Najlepszy klip tygodnia",
      description: "Wrzucaj klipy na Discord #klipy-z-live. Głosowanie reakcjami. Top 3 wygrywają nagrody!",
      prize: "1. miejsce: 10,000 GT + Custom Emoji | 2. miejsce: 5,000 GT | 3. miejsce: 2,500 GT",
      winnersCount: 3,
      active: true,
      endsAt: new Date(now.getTime() + 6 * 24 * 60 * 60 * 1000),
    },
  ];

  await prisma.event.deleteMany();
  await prisma.event.createMany({ data: events });
  console.log(`✅ ${events.length} events seeded`);

  console.log("\n✅ Database seeded successfully! 👻");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
