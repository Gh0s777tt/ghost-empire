// src/lib/achievement-categories.ts
// Grupowanie achievementów po KATEGORII wyświetlania — bez kolumny w bazie.
//
// Dlaczego istnieje: profil renderuje płaską siatkę wszystkich achievementów, która
// przy ~40+ pozycjach zajmuje pół ekranu. Chcemy zwijaną listę pogrupowaną tematycznie,
// ale `Achievement` NIE ma kolumny `category` (a zmiana schematu jest poza zakresem tego
// wycinka — wymagałaby migracji na żywej bazie). Zamiast tego wyprowadzamy kategorię
// deterministycznie z istniejącego `Achievement.triggerType` (~23 wartości, pełna lista
// w `src/lib/achievements.ts` → `AchievementTriggerType`). Mapowanie jest czystą funkcją,
// więc nie dotyka bazy i jest trywialne do przetestowania.
//
// Etykiety są po polsku „inline" — domyślny locale aplikacji to PL, a nazwy kategorii to
// generyczne słowa (Postęp, Ekonomia…), nie marka/waluta, więc nie ma tu wycieku white-label.

/** Identyfikatory kategorii — stabilne klucze (kolejność wyświetlania w `ACHIEVEMENT_CATEGORIES`). */
export type AchievementCategoryId =
  | "postep"
  | "ekonomia"
  | "streaming"
  | "wydarzenia"
  | "spolecznosc"
  | "specjalne";

/** Metadane pojedynczej kategorii wyświetlania. */
export type AchievementCategory = {
  id: AchievementCategoryId;
  /** Nazwa PL (locale domyślny) — patrz nota o white-label w nagłówku pliku. */
  label: string;
  /** Emoji-ikonka nagłówka grupy (spójne z emoji używanymi w profilu). */
  emoji: string;
};

/**
 * Kategorie w kolejności wyświetlania. „Specjalne" celowo na końcu — to worek na
 * ręcznie przyznawane (`manual`) i wszystko bez znanego `triggerType`.
 */
export const ACHIEVEMENT_CATEGORIES: readonly AchievementCategory[] = [
  { id: "postep",      label: "Postęp",              emoji: "📊" },
  { id: "ekonomia",    label: "Ekonomia",            emoji: "💰" },
  { id: "streaming",   label: "Streaming i platformy", emoji: "📡" },
  { id: "wydarzenia",  label: "Wydarzenia",          emoji: "🎉" },
  { id: "spolecznosc", label: "Społeczność",         emoji: "🛡️" },
  { id: "specjalne",   label: "Specjalne",           emoji: "✨" },
] as const;

// Mapowanie triggerType → kategoria. Wartości pokrywają WSZYSTKIE typy z seedu
// (`prisma/seed.ts`) i unii `AchievementTriggerType`; cokolwiek nieznanego / `null`
// spada do „Specjalne" przez fallback w `categoryForTrigger`.
const TRIGGER_TO_CATEGORY: Record<string, AchievementCategoryId> = {
  // Postęp konta — poziom, seria, aktywność czatu, prestiż.
  level: "postep",
  streak: "postep",
  messages: "postep",
  prestige: "postep",

  // Ekonomia GT — zarobek, wydatki w sklepie, kasyno na żetony.
  tokens_earned: "ekonomia",
  shop_purchases: "ekonomia",
  casino_plays: "ekonomia",

  // Streaming i platformy — podpięte konta OAuth oraz eventy z platform
  // (suby, gift-suby, bity, super-chaty, członkostwa, donacje).
  platforms_linked: "streaming",
  twitch_sub_received: "streaming",
  kick_sub_received: "streaming",
  gift_subs_given: "streaming",
  bits_cheered: "streaming",
  super_chats_received: "streaming",
  yt_member: "streaming",
  donations_count: "streaming",
  donations_amount_pln: "streaming",

  // Wydarzenia — wygrane eventy/giveaye, odebrane dropy, pojedynki PvP.
  events_won: "wydarzenia",
  drops_claimed: "wydarzenia",
  duels_won: "wydarzenia",

  // Społeczność — klany i Ghost Companion (element „pet"/społeczny).
  clans_joined: "spolecznosc",
  clan_contributed: "spolecznosc",
  companion_xp: "spolecznosc",

  // Specjalne — ręcznie przyznawane (nagrody eventowe, wyróżnienia).
  manual: "specjalne",
};

/**
 * Wyprowadza kategorię wyświetlania z `triggerType` achievementu.
 *
 * @param triggerType - wartość `Achievement.triggerType` (może być `null` dla starych/ręcznych wpisów).
 * @returns id kategorii; nieznane lub `null` trafia do `"specjalne"` (bezpieczny worek).
 */
export function categoryForTrigger(
  triggerType: string | null | undefined,
): AchievementCategoryId {
  if (!triggerType) return "specjalne";
  return TRIGGER_TO_CATEGORY[triggerType] ?? "specjalne";
}
