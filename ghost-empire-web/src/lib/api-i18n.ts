// src/lib/api-i18n.ts
// Locale-aware API error responses, boundary-translation style.
//
// Player-facing route handlers return Polish error messages. This helper turns
// those into a `{ error }` JSON response, translating the message to English when
// the request locale is English. Locale comes from the `NEXT_LOCALE` cookie that
// next-intl's middleware sets on document navigations — the browser sends it on
// same-origin /api/* fetches even though /api is outside the locale routing.
//
// Translation is a plain PL->EN dictionary keyed by the exact Polish string.
// Anything not listed (server-only messages, interpolated ones like
// `Wymagany Level 5`) falls back to the original Polish — never an error, just
// untranslated. The Discord bot / cron callers have no cookie -> always Polish.
//
// White-label: a currency-name error must show the TENANT's token name, never the
// founder's literal "Ghost Tokens". Such messages carry the `%tokenName%` marker
// (same convention as the message catalogs, see i18n-branding.ts) on BOTH sides of
// the dictionary; the marker is resolved to `getCurrentTenant().tokenName` at the
// boundary. Keying the dictionary on the stable marker keeps PL->EN matching intact
// while the viewer still sees their portal's currency. (The casino's free "Żetony"
// are a universal, non-white-label currency — those stay literal.)
//
// Deliberately NOT covered (separate follow-up): admin/bot/webhook/internal
// endpoints, and interpolated messages.
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getCurrentTenant } from "@/lib/tenant";

const EN: Record<string, string> = {
  // Shared
  "Musisz być zalogowany": "You must be logged in",
  "Nieprawidłowe dane": "Invalid request",
  "Błąd serwera": "Server error",
  "Za szybko. Spróbuj za chwilę.": "Too fast. Try again in a moment.",
  "Zbyt wiele żądań. Spróbuj ponownie za chwilę.": "Too many requests. Try again in a moment.",
  "Za dużo prób. Poczekaj chwilę.": "Too many attempts. Please wait a moment.",
  // %tokenName% → the tenant's currency name at the boundary (white-label).
  "Za mało %tokenName%": "Not enough %tokenName%",

  // Shop
  "Brak itemId": "Missing item id",
  "Item nie istnieje": "Item does not exist",
  "Item niedostępny": "Item unavailable",
  "Brak na stanie": "Out of stock",
  // Casino chips (free, universal currency — not white-labeled, stays literal).
  "Za mało żetonów": "Not enough chips",
  "Brak usera": "User not found",
  "Wymagany Dual Supporter (sub na 2 platformach)": "Dual Supporter required (sub on 2 platforms)",

  // Drop codes
  "Brak kodu": "No code provided",
  "Kod: 3-24 znaków A-Z, 0-9, _, -": "Code: 3-24 chars A-Z, 0-9, _, -",
  "Kod nie istnieje": "Code does not exist",
  "Kod nieaktywny": "Code inactive",
  "Kod wygasł": "Code expired",
  "Już odebrałeś ten kod": "You already claimed this code",

  // Polls
  "Brak pollId / optionIndex": "Missing pollId / optionIndex",
  "Ankieta nie istnieje": "Poll does not exist",
  "Ankieta jest zamknięta": "Poll is closed",
  "Nieprawidłowa opcja": "Invalid option",

  // Events
  "Brak eventId": "Missing event id",
  "Event nie istnieje": "Event does not exist",
  "Event nieaktywny": "Event inactive",
  "Event się zakończył": "Event has ended",
  "Tego eventu nie da się joinować": "This event can't be joined",
  "Już dołączyłeś do tego eventu": "You already joined this event",
  "Liczba biletów musi być 1-100": "Ticket count must be 1-100",
  "To nie jest raffle": "This is not a raffle",
  "Bilet nie ma ceny": "Ticket has no price",

  // Predictions (wager)
  "Wymagane: optionIndex (number) + tokensWagered (number)": "Required: optionIndex (number) + tokensWagered (number)",
  "Niepoprawna opcja": "Invalid option",
  "Zakład nie istnieje": "Prediction does not exist",
  "Zakład jest już zamknięty": "Prediction is already closed",
  "Czas obstawiania minął": "Betting is closed",
  "Opcja poza zakresem": "Option out of range",
  "Już obstawiłeś ten zakład": "You already bet on this prediction",

  // GT games (casino)
  "Nieznana gra": "Unknown game",
  "Wybierz: red / black / liczba 0-36": "Choose: red / black / number 0-36",

  // Battle Pass / seasons
  "Brak rewardId": "Missing reward id",
  "Nagroda nie istnieje": "Reward does not exist",
  "Brak progresu w tym sezonie": "No progress this season",
  "Ta nagroda wymaga Premium Pass": "This reward requires the Premium Pass",
  "Już odebrane": "Already claimed",

  // Wheel of Fortune (spins run on the free casino chips, not GT — universal currency).
  "Koło Fortuny jest aktualnie wyłączone": "The Wheel of Fortune is currently disabled",
  "Koło nie jest skonfigurowane": "The wheel is not configured",
  "Za mało żetonów na zakręcenie": "Not enough chips to spin",
};

/**
 * Pure translation + white-label substitution (no I/O — unit-tested).
 *
 * 1. When `locale === "en"`, map the Polish message to English via the EN dict;
 *    unknown/interpolated messages fall through untranslated (by design).
 * 2. Replace the `%tokenName%` marker with the tenant's currency name, so a viewer
 *    never sees the founder's literal "Ghost Tokens". The marker lives on both the
 *    PL key and its EN value, so this one substitution covers either locale.
 *
 * @param message  the raw Polish message (or a `%tokenName%`-marked one)
 * @param opts.locale     "en" to translate, anything else keeps Polish
 * @param opts.tokenName  the active tenant's currency name (substituted for the marker)
 */
export function resolveErrorMessage(message: string, opts: { locale: string; tokenName: string }): string {
  const translated = opts.locale === "en" ? (EN[message] ?? message) : message;
  return translated.includes("%tokenName%") ? translated.replaceAll("%tokenName%", opts.tokenName) : translated;
}

async function localizeError(message: string): Promise<string> {
  const store = await cookies();
  const locale = store.get("NEXT_LOCALE")?.value === "en" ? "en" : "pl";
  // Resolve the tenant only when the message actually carries the marker — keeps the
  // common error path a plain cookie read (getCurrentTenant is React-cached per
  // request anyway, so callers that already resolved the tenant pay nothing extra).
  const tokenName = message.includes("%tokenName%") ? (await getCurrentTenant()).tokenName : "";
  return resolveErrorMessage(message, { locale, tokenName });
}

/**
 * Build a localized `{ error }` JSON response. Drop-in for
 * `NextResponse.json({ error: msg }, { status })` in player-facing routes —
 * pass rate-limit headers as the optional third arg.
 */
export async function jsonError(message: string, status: number, headers?: HeadersInit) {
  const error = await localizeError(message);
  return NextResponse.json({ error }, headers ? { status, headers } : { status });
}
