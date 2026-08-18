// src/lib/features.ts
// Per-portal FEATURE FLAGS — the single source of truth for which viewer-facing modules a portal
// owner can turn on/off. Pure data + pure helpers (no DB, no React) so BOTH the client nav
// (Header.tsx) and the server (page gates, admin API) import the same catalog.
//
// MODEL: "allow by default". A portal stores only the keys it has DISABLED (`Tenant.disabledFeatures
// String[] @default([])`). Empty list = everything on — so existing portals keep their exact behavior
// after the migration, and a brand-new key added here is automatically ENABLED everywhere until an
// owner turns it off. A disabled feature (a) disappears from the viewer nav (Header filters `NAV` by
// these keys) and (b) its page returns `notFound()` (via `requireFeature()` in lib/feature-gate).
//
// NIE mylić z `Tenant.plan` (basic/pro/elite): plan = płatny entitlement platformy; te flagi = wybór
// właściciela portalu, co pokazać własnym widzom. Panel: /admin#features (`FeaturesManager`).
//
// Dodając nową funkcję: dopisz wpis TU (klucz stabilny — trafia do DB), wskaż `href` (trasa widza,
// używana do filtrowania nawigacji), `navKey` (klucz i18n etykiety w namespace "nav" — reużywamy już
// przetłumaczone etykiety menu) i `category`. Bramkę strony dodaj przez `requireFeature("<klucz>")`.

/** Grupy tematyczne — sterują układem panelu /admin#features i odpowiadają grupom menu widza. */
export type FeatureCategory = "economy" | "games" | "community" | "activities" | "support";

export type Feature = {
  /** Stable storage key (trafia do `Tenant.disabledFeatures`). NIGDY nie zmieniaj po wydaniu. */
  key: string;
  /** Canonical viewer route this feature owns — używane do filtrowania nawigacji i jako link w panelu. */
  href: string;
  /** i18n key w namespace "nav" — etykieta funkcji (reużywa przetłumaczone etykiety menu, 14 locale). */
  navKey: string;
  category: FeatureCategory;
};

/**
 * Katalog przełączalnych funkcji widza. Rdzeń portalu (home, ranking, profil, wsparcie techniczne)
 * celowo NIE jest tu — tego nie wyłączamy. Kolejność = kolejność w panelu (w obrębie kategorii).
 */
export const FEATURES: readonly Feature[] = [
  // — Ekonomia —
  { key: "shop", href: "/shop", navKey: "shop", category: "economy" },
  { key: "sounds", href: "/sounds", navKey: "sounds", category: "economy" },
  { key: "drops", href: "/drops", navKey: "drops", category: "economy" },
  { key: "support", href: "/support", navKey: "support", category: "support" },
  // — Gry —
  { key: "casino", href: "/kasyno", navKey: "casino", category: "games" },
  { key: "wheel", href: "/wheel", navKey: "wheel", category: "games" },
  { key: "companion", href: "/companion", navKey: "companion", category: "games" },
  { key: "games", href: "/games", navKey: "library", category: "games" },
  // — Społeczność —
  { key: "clans", href: "/clans", navKey: "clans", category: "community" },
  { key: "clips", href: "/clips", navKey: "clips", category: "community" },
  { key: "collectibles", href: "/collectibles", navKey: "collectibles", category: "community" },
  { key: "market", href: "/market", navKey: "market", category: "community" },
  { key: "leagues", href: "/leagues", navKey: "leagues", category: "community" },
  { key: "achievements", href: "/achievements", navKey: "achievements", category: "community" },
  { key: "seasons", href: "/seasons", navKey: "seasons", category: "community" },
  { key: "wrapped", href: "/wrapped", navKey: "wrapped", category: "community" },
  // — Aktywności —
  { key: "events", href: "/events", navKey: "events", category: "activities" },
  { key: "bounties", href: "/bounties", navKey: "bounties", category: "activities" },
  { key: "auctions", href: "/auctions", navKey: "auctions", category: "activities" },
  { key: "predictions", href: "/predictions", navKey: "predictions", category: "activities" },
  { key: "polls", href: "/polls", navKey: "polls", category: "activities" },
  { key: "trivia", href: "/trivia", navKey: "trivia", category: "activities" },
  { key: "quests", href: "/quests", navKey: "quests", category: "activities" },
  { key: "schedule", href: "/schedule", navKey: "schedule", category: "activities" },
] as const;

/** Zbiór wszystkich prawidłowych kluczy — do walidacji wejścia w API (odrzuć nieznane). */
export const FEATURE_KEYS: ReadonlySet<string> = new Set(FEATURES.map((f) => f.key));

/** href → Feature (do filtrowania nawigacji po ścieżce linku). */
const BY_HREF = new Map<string, Feature>(FEATURES.map((f) => [f.href, f]));

/** Feature odpowiadająca danej trasie nawigacji, albo `undefined` (trasa rdzenia — nie wyłączalna). */
export function featureForHref(href: string): Feature | undefined {
  return BY_HREF.get(href);
}

/**
 * Czy funkcja jest WŁĄCZONA dla portalu? Allow-by-default: włączona, dopóki jej klucza NIE ma na
 * liście wyłączonych. `null`/`undefined` (brak danych / pre-migracja) traktujemy jak „nic wyłączone".
 *
 * @param disabled Lista wyłączonych kluczy (`Tenant.disabledFeatures`).
 * @param key      Klucz funkcji.
 */
export function isFeatureEnabled(disabled: readonly string[] | null | undefined, key: string): boolean {
  return !(disabled ?? []).includes(key);
}

/**
 * Czy trasa (href) jest ukryta w nawigacji dla portalu? True tylko, gdy href należy do znanej funkcji
 * ORAZ ta funkcja jest wyłączona. Trasy rdzenia (spoza katalogu) nigdy nie są ukrywane.
 */
export function isHrefHidden(disabled: readonly string[] | null | undefined, href: string): boolean {
  const f = BY_HREF.get(href);
  return f ? !isFeatureEnabled(disabled, f.key) : false;
}
