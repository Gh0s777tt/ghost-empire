// prisma/seed.ts
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding database...");

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
  ];

  for (const a of achievements) {
    await prisma.achievement.upsert({
      where: { code: a.code },
      update: a,
      create: a,
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
