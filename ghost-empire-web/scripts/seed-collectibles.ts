// scripts/seed-collectibles.ts
// SAFE prod seed for the starter collectible cards (#551/#552) so packs + the market
// have something to roll/trade. Idempotent — upserts ONLY these rows by a stable id, so
// re-running won't duplicate and won't touch any cards the streamer added by hand.
//   npx tsx scripts/seed-collectibles.ts      (reads DATABASE_URL from .env.local / .env)

// Load env BEFORE importing the prisma client — the pg adapter reads DATABASE_URL at
// import time (src/lib/prisma.ts), so a dynamic import after loadEnvFile is required.
for (const f of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(f);
  } catch {
    /* file absent (CI / Vercel) — env already injected */
  }
}

const CARDS: { id: string; name: string; emoji: string; rarity: string; description: string; active?: boolean }[] = [
  // common (6)
  { id: "ge-pixel-ghost", name: "Pikselowy Duch", emoji: "👻", rarity: "common", description: "Najzwyklejszy duch w Imperium. Każdy zaczyna od niego." },
  { id: "ge-lurker", name: "Podglądacz", emoji: "👁️", rarity: "common", description: "Ogląda, nie pisze. Szanujemy ciszę." },
  { id: "ge-chat-goblin", name: "Goblin z Czatu", emoji: "👺", rarity: "common", description: "Spamuje emotki bez opamiętania." },
  { id: "ge-first-follow", name: "Pierwszy Obserwujący", emoji: "⭐", rarity: "common", description: "Był tu, zanim było modnie." },
  { id: "ge-loyal-sub", name: "Wierny Sub", emoji: "💜", rarity: "common", description: "Odnawia co miesiąc bez pytania." },
  { id: "ge-emote-lord", name: "Emote Lord", emoji: "😂", rarity: "common", description: "KEKW KEKW KEKW" },
  // rare (4)
  { id: "ge-hype-conductor", name: "Maszynista Hype Train", emoji: "🚂", rarity: "rare", description: "Rozkręca pociąg aż do ostatniego poziomu." },
  { id: "ge-clip-hunter", name: "Łowca Klipów", emoji: "🎬", rarity: "rare", description: "Tnie najlepsze momenty zanim się skończą." },
  { id: "ge-night-owl", name: "Nocny Marek", emoji: "🦉", rarity: "rare", description: "Ogląda streamy do 4 nad ranem." },
  { id: "ge-bit-baron", name: "Baron Bitów", emoji: "💎", rarity: "rare", description: "Sypie bitami jak konfetti." },
  // epic (3)
  { id: "ge-raid-boss", name: "Boss Rajdu", emoji: "🐲", rarity: "epic", description: "Przyprowadza całą armię widzów." },
  { id: "ge-mod-hammer", name: "Młot Moderatora", emoji: "🔨", rarity: "epic", description: "Ban przychodzi szybciej niż myślisz." },
  { id: "ge-golden-donor", name: "Złoty Donator", emoji: "🏆", rarity: "epic", description: "Hojność na poziomie legendy." },
  // legendary (2)
  { id: "ge-phantom-king", name: "Król Widm", emoji: "👑", rarity: "legendary", description: "Włada całym Ghost Empire z cienia." },
  { id: "ge-founder", name: "Założyciel Imperium", emoji: "🔱", rarity: "legendary", description: "Ten, od którego wszystko się zaczęło." },

  // ── batch 2 ──────────────────────────────────────────────────────────────
  // common (10)
  { id: "ge-newbie", name: "Świeżak", emoji: "🐣", rarity: "common", description: "Pierwszy raz na streamie. Witamy w Imperium." },
  { id: "ge-copium", name: "Kopiumiarz", emoji: "🫧", rarity: "common", description: "Wierzy w comeback do samego końca." },
  { id: "ge-backseat", name: "Backseat Gamer", emoji: "🪑", rarity: "common", description: "Wie lepiej jak grać. Zawsze." },
  { id: "ge-vod-watcher", name: "Oglądacz VOD-ów", emoji: "📼", rarity: "common", description: "Nadrabia streamy o 3 w nocy." },
  { id: "ge-mobile", name: "Widz z Telefonu", emoji: "📱", rarity: "common", description: "Ogląda w autobusie, na danych." },
  { id: "ge-discord-mod", name: "Mod z Discorda", emoji: "💬", rarity: "common", description: "Pilnuje porządku po godzinach." },
  { id: "ge-pog", name: "Pogchamp", emoji: "😮", rarity: "common", description: "POG! Reaguje na wszystko." },
  { id: "ge-snack", name: "Przekąskowicz", emoji: "🍿", rarity: "common", description: "Stream to czas na chrupki." },
  { id: "ge-afk", name: "AFK Andrzej", emoji: "🚪", rarity: "common", description: "Wyszedł na chwilę. Trzy godziny temu." },
  { id: "ge-coffee", name: "Kofeinowy Duch", emoji: "☕", rarity: "common", description: "Działa wyłącznie na kawie." },
  // rare (7)
  { id: "ge-streamsniper", name: "Stream Sniper", emoji: "🎯", rarity: "rare", description: "Zawsze wie gdzie jesteś na mapie." },
  { id: "ge-speedrunner", name: "Speedrunner", emoji: "⏱️", rarity: "rare", description: "Frame-perfect, bez wyjątków." },
  { id: "ge-tts", name: "TTS Trickster", emoji: "🔊", rarity: "rare", description: "Płaci, żeby bot mówił głupoty." },
  { id: "ge-fanart", name: "Twórca Fan Artów", emoji: "🎨", rarity: "rare", description: "Rysuje całe Imperium." },
  { id: "ge-clutch", name: "Clutch Master", emoji: "🔥", rarity: "rare", description: "1v5? Bez stresu." },
  { id: "ge-lucky", name: "Szczęściarz", emoji: "🍀", rarity: "rare", description: "Jackpot za pierwszym razem." },
  { id: "ge-veteran", name: "Weteran", emoji: "🎖️", rarity: "rare", description: "Pamięta jeszcze stare emotki." },
  // epic (5)
  { id: "ge-whale", name: "Wieloryb", emoji: "🐋", rarity: "epic", description: "Donejty prosto z kosmosu." },
  { id: "ge-cyber", name: "Cyber Duch", emoji: "🤖", rarity: "epic", description: "Zna każdy skrót klawiszowy." },
  { id: "ge-dj", name: "DJ Imperium", emoji: "🎧", rarity: "epic", description: "Song requesty bez końca." },
  { id: "ge-strategist", name: "Strateg", emoji: "♟️", rarity: "epic", description: "Trzy ruchy do przodu." },
  { id: "ge-collector", name: "Kolekcjoner", emoji: "🗃️", rarity: "epic", description: "Ma każdą kartę. Prawie." },
  // legendary (3)
  { id: "ge-reaper", name: "Kosiarz Dusz", emoji: "⚰️", rarity: "legendary", description: "Bany roznosi osobiście." },
  { id: "ge-cosmic", name: "Kosmiczny Widmo", emoji: "🌌", rarity: "legendary", description: "Duch z zupełnie innego wymiaru." },
  { id: "ge-goat", name: "GOAT", emoji: "🐐", rarity: "legendary", description: "Greatest Of All Time. Bezdyskusyjnie." },

  // ═══ SERIA: BOSSOWIE GIER (evergreen, w puli) ═════════════════════════════
  { id: "ge-boss-slime", name: "Śluzowiec", emoji: "🟩", rarity: "common", description: "Bossowie Gier · Pierwszy boss każdego RPG." },
  { id: "ge-boss-goblin", name: "Goblin Wojownik", emoji: "👹", rarity: "common", description: "Bossowie Gier · Mały, ale wredny." },
  { id: "ge-boss-golem", name: "Kamienny Golem", emoji: "🗿", rarity: "rare", description: "Bossowie Gier · Wolny i twardy jak skała." },
  { id: "ge-boss-kraken", name: "Kraken Głębin", emoji: "🐙", rarity: "epic", description: "Bossowie Gier · Osiem macek, zero litości." },
  { id: "ge-boss-dragon", name: "Smok Końcowy", emoji: "🐉", rarity: "epic", description: "Bossowie Gier · Strażnik ostatniego poziomu." },
  { id: "ge-boss-deathlord", name: "Władca Śmierci", emoji: "☠️", rarity: "legendary", description: "Bossowie Gier · Final boss całego Imperium." },

  // ═══ SERIA: KAMIENIE MILOWE / EVENTY (evergreen, edycja limitowana) ════════
  { id: "ge-ev-launch", name: "Premiera Imperium", emoji: "🚀", rarity: "rare", description: "Edycja Limitowana · Na pamiątkę startu platformy." },
  { id: "ge-ev-1k", name: "1000 Obserwujących", emoji: "🎉", rarity: "rare", description: "Kamień Milowy · Pierwszy tysiąc." },
  { id: "ge-ev-subathon", name: "Subathon 2026", emoji: "⏳", rarity: "epic", description: "Event · Zegar nie przestawał tykać." },
  { id: "ge-ev-anniversary", name: "Rocznica Imperium", emoji: "🎂", rarity: "epic", description: "Event · Rok cienia i chwały." },
  { id: "ge-ev-champion", name: "Mistrz Sezonu", emoji: "🥇", rarity: "legendary", description: "Event · Numer jeden w rankingu sezonu." },
  { id: "ge-ev-gold-founder", name: "Złoty Założyciel", emoji: "🏅", rarity: "legendary", description: "Edycja Limitowana · Tylko dla pierwszych widzów." },

  // ═══ SERIA: HALLOWEEN (sezonowa — wł. w październiku w /admin#collectibles) ═
  { id: "ge-hw-pumpkin", name: "Dyniowy Strach", emoji: "🎃", rarity: "common", description: "Halloween · Świeci w oknie co noc.", active: false },
  { id: "ge-hw-bat", name: "Nietoperz Widmo", emoji: "🦇", rarity: "common", description: "Halloween · Krąży nad czatem.", active: false },
  { id: "ge-hw-witch", name: "Wiedźma z Czatu", emoji: "🧙", rarity: "rare", description: "Halloween · Rzuca klątwy emotkami.", active: false },
  { id: "ge-hw-vampire", name: "Wampir Subów", emoji: "🧛", rarity: "rare", description: "Halloween · Żywi się odnowieniami.", active: false },
  { id: "ge-hw-reaper", name: "Żniwiarz Halloween", emoji: "💀", rarity: "epic", description: "Halloween · Zbiera dusze widzów.", active: false },
  { id: "ge-hw-demon", name: "Demon Północy", emoji: "😈", rarity: "legendary", description: "Halloween · Budzi się dokładnie o 00:00.", active: false },

  // ═══ SERIA: ZIMA / ŚWIĘTA (sezonowa — wł. w grudniu w /admin#collectibles) ══
  { id: "ge-xmas-snowman", name: "Bałwan Streamera", emoji: "⛄", rarity: "common", description: "Mroźne Imperium · Topnieje przy laggach.", active: false },
  { id: "ge-xmas-gift", name: "Świąteczny Prezent", emoji: "🎁", rarity: "common", description: "Mroźne Imperium · Co jest w środku?", active: false },
  { id: "ge-xmas-elf", name: "Elf Moderator", emoji: "🧝", rarity: "rare", description: "Mroźne Imperium · Banuje niegrzecznych.", active: false },
  { id: "ge-xmas-tree", name: "Choinka Imperium", emoji: "🎄", rarity: "rare", description: "Mroźne Imperium · Świeci na czerwono.", active: false },
  { id: "ge-xmas-santa", name: "Święty Duch", emoji: "🎅", rarity: "epic", description: "Mroźne Imperium · Rozdaje GT zamiast węgla.", active: false },
  { id: "ge-xmas-frost", name: "Władca Mrozu", emoji: "❄️", rarity: "legendary", description: "Mroźne Imperium · Zamraża cały czat.", active: false },
];

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  // Same default tenant the achievements seed uses (so tenant-scoped reads match).
  const tenant = await prisma.tenant.upsert({
    where: { slug: "ghost-empire" },
    update: {},
    create: { slug: "ghost-empire", name: "GH0ST EMPIRE", shortName: "Ghost Empire", brandColor: "#E50914" },
  });
  let i = 0;
  for (const c of CARDS) {
    await prisma.collectible.upsert({
      where: { id: c.id },
      // NOTE: `active` is intentionally NOT in `update` — so re-running the seed never
      // clobbers a visibility toggle the streamer set by hand in /admin#collectibles.
      update: { name: c.name, emoji: c.emoji, rarity: c.rarity, description: c.description },
      create: { id: c.id, tenantId: tenant.id, name: c.name, emoji: c.emoji, rarity: c.rarity, description: c.description, sortOrder: i, active: c.active ?? true },
    });
    i++;
  }
  const total = await prisma.collectible.count({ where: { tenantId: tenant.id } });
  console.log(`✅ upserted ${CARDS.length} starter collectibles (tenant ${tenant.slug}); ${total} total in catalog`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
