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

const CARDS = [
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
      update: { name: c.name, emoji: c.emoji, rarity: c.rarity, description: c.description, active: true },
      create: { id: c.id, tenantId: tenant.id, name: c.name, emoji: c.emoji, rarity: c.rarity, description: c.description, sortOrder: i },
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
