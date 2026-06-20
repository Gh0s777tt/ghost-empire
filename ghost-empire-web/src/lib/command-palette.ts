// src/lib/command-palette.ts
// Command palette / quick-nav index (#548). Pure: the destination list + a small
// fuzzy matcher (prefix > word-start > substring > subsequence). `labelKey` is a
// `nav.*` i18n key resolved at render; `keywords` are static EN+PL terms so search
// works regardless of the UI language.
export type Command = { id: string; href: string; labelKey: string; keywords: string };

export const COMMANDS: Command[] = [
  { id: "home", href: "/", labelKey: "home", keywords: "home start główna strona" },
  { id: "support", href: "/support", labelKey: "support", keywords: "support tip donate wsparcie napiwek donejt wesprzyj" },
  { id: "ranking", href: "/ranking", labelKey: "ranking", keywords: "ranking leaderboard top tabela wyników" },
  { id: "shop", href: "/shop", labelKey: "shop", keywords: "shop store buy sklep kup przedmioty" },
  { id: "achievements", href: "/achievements", labelKey: "achievements", keywords: "achievements badges osiągnięcia odznaki" },
  { id: "quests", href: "/quests", labelKey: "quests", keywords: "quests tasks daily questy zadania codzienne" },
  { id: "seasons", href: "/seasons", labelKey: "seasons", keywords: "season battle pass przepustka sezon" },
  { id: "clans", href: "/clans", labelKey: "clans", keywords: "clans guild klany gildia" },
  { id: "clips", href: "/clips", labelKey: "clips", keywords: "clips clip of the week klipy klip tygodnia" },
  { id: "collectibles", href: "/collectibles", labelKey: "collectibles", keywords: "collectibles cards packs karty kolekcjonerskie paczki kolekcja" },
  { id: "market", href: "/market", labelKey: "market", keywords: "market trade buy sell cards giełda handel kup sprzedaj karty marketplace" },
  { id: "search", href: "/search", labelKey: "search", keywords: "search smart semantic find szukaj wyszukiwarka znajdź ai" },
  { id: "trivia", href: "/trivia", labelKey: "trivia", keywords: "trivia quiz pytania" },
  { id: "wheel", href: "/wheel", labelKey: "wheel", keywords: "wheel fortune koło fortuny" },
  { id: "casino", href: "/kasyno", labelKey: "casino", keywords: "casino kasyno gry hazard slots dice" },
  { id: "games", href: "/games", labelKey: "games", keywords: "games library gry biblioteka" },
  { id: "companion", href: "/companion", labelKey: "companion", keywords: "companion pet towarzysz zwierzak" },
  { id: "sounds", href: "/sounds", labelKey: "sounds", keywords: "sounds tts dźwięki stream" },
  { id: "events", href: "/events", labelKey: "events", keywords: "events raffle eventy losowanie" },
  { id: "polls", href: "/polls", labelKey: "polls", keywords: "polls vote ankiety głosowanie" },
  { id: "predictions", href: "/predictions", labelKey: "predictions", keywords: "predictions bet predykcje obstaw" },
  { id: "schedule", href: "/schedule", labelKey: "schedule", keywords: "schedule stream plan harmonogram kiedy live" },
  { id: "profile", href: "/profile", labelKey: "myProfile", keywords: "profile account profil konto" },
  { id: "portals", href: "/portals", labelKey: "portals", keywords: "portals switch portale streamerzy" },
];

/** Match score for one searchable string against a query. 0 = no match, higher = better. */
export function scoreCommand(haystack: string, query: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 1; // empty query → everything matches at a base score (preserve order)
  const h = haystack.toLowerCase();
  const idx = h.indexOf(q);
  if (idx === 0) return 100; // prefix
  if (idx > 0) return h[idx - 1] === " " ? 70 : 40; // word-start vs mid-substring
  // subsequence (typo/skip tolerant)
  let qi = 0;
  for (let i = 0; i < h.length && qi < q.length; i++) if (h[i] === q[qi]) qi++;
  return qi === q.length ? 10 : 0;
}

/** Filter + rank items by their `search` string against the query (stable for ties). */
export function filterCommands<T extends { search: string }>(items: T[], query: string): T[] {
  return items
    .map((it, i) => ({ it, i, s: scoreCommand(it.search, query) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.it);
}
