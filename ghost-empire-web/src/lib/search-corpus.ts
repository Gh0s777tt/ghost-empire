// src/lib/search-corpus.ts
// Builds the searchable corpus for semantic search (#554): the portal's key pages
// (static) plus its achievements and shop items (per-tenant, from the DB). Each item
// carries human `title`, an embed-friendly `text`, a destination `href`, and a stable
// `id` (so the corpus can be hashed for embedding-cache reuse).
import { prisma } from "@/lib/prisma";

export type CorpusItem = { id: string; type: "page" | "achievement" | "shop"; title: string; text: string; href: string };

// Static destinations. `text` mixes EN + PL terms so a query in either language embeds near it.
const PAGES: CorpusItem[] = [
  { id: "p-support", type: "page", title: "Support / tip the streamer", text: "support tip donate money paypal crypto iban fundraising goal wsparcie napiwek donejt zbiórka", href: "/support" },
  { id: "p-collectibles", type: "page", title: "Collectible cards", text: "collectible trading cards packs rarity collection open a pack karty kolekcjonerskie paczki rzadkość", href: "/collectibles" },
  { id: "p-market", type: "page", title: "Card market", text: "marketplace trade buy and sell cards for tokens giełda handel kartami kup sprzedaj", href: "/market" },
  { id: "p-ranking", type: "page", title: "Ranking / leaderboard", text: "ranking leaderboard top players points standings tabela wyników najlepsi", href: "/ranking" },
  { id: "p-shop", type: "page", title: "Shop", text: "shop buy items rewards perks with tokens sklep przedmioty nagrody", href: "/shop" },
  { id: "p-casino", type: "page", title: "Casino games", text: "casino dice crash plinko mines blackjack roulette slots gambling bet kasyno gry hazard obstaw", href: "/kasyno" },
  { id: "p-wheel", type: "page", title: "Wheel of Fortune", text: "wheel of fortune spin to win prizes koło fortuny zakręć", href: "/wheel" },
  { id: "p-clans", type: "page", title: "Clans & clan wars", text: "clans guilds teams clan wars compete klany gildie wojny klanów", href: "/clans" },
  { id: "p-trivia", type: "page", title: "Trivia quiz", text: "trivia quiz answer questions earn tokens quiz pytania odpowiedzi", href: "/trivia" },
  { id: "p-achievements", type: "page", title: "Achievements", text: "achievements badges unlock progress osiągnięcia odznaki", href: "/achievements" },
  { id: "p-schedule", type: "page", title: "Stream schedule", text: "schedule when is the streamer live stream times calendar harmonogram plan kiedy live", href: "/schedule" },
  { id: "p-clips", type: "page", title: "Clip of the week", text: "clips clip of the week vote best moments klipy najlepsze momenty", href: "/clips" },
  { id: "p-companion", type: "page", title: "Companion pet", text: "companion virtual pet creature grow feed towarzysz zwierzak maskotka", href: "/companion" },
  { id: "p-profile", type: "page", title: "Your profile", text: "profile account level tokens balance achievements settings profil konto saldo poziom", href: "/profile" },
];

export async function buildCorpus(tid: string | null): Promise<CorpusItem[]> {
  const [ach, shop] = await Promise.all([
    prisma.achievement.findMany({ where: tid ? { tenantId: tid } : {}, select: { code: true, name: true, description: true }, take: 120 }).catch(() => []),
    prisma.shopItem.findMany({ where: { active: true, ...(tid ? { tenantId: tid } : {}) }, select: { id: true, name: true, description: true }, take: 120 }).catch(() => []),
  ]);
  const aItems: CorpusItem[] = ach.map((a) => ({ id: `a-${a.code}`, type: "achievement", title: a.name, text: `${a.name}. ${a.description ?? ""}`, href: "/achievements" }));
  const sItems: CorpusItem[] = shop.map((s) => ({ id: `s-${s.id}`, type: "shop", title: s.name, text: `${s.name}. ${s.description ?? ""}`, href: "/shop" }));
  return [...PAGES, ...aItems, ...sItems];
}
