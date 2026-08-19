// src/lib/donations/fx.ts
// Currency handling for money-in (#donation-layer). Pure — unit-tested.
//
// WHY THIS EXISTS: `economy.plnFromCurrency` is a flat `×4 for everything that is not PLN`. That was
// survivable while every minting rail was PL-centric (PayMedia rejects non-PLN outright), but a
// multi-currency rail makes it a catastrophic OVER-MINT: ¥1000 (~25 PLN) would convert to 4000 PLN
// and mint ~160× the correct currency. Zero-decimal currencies make it worse, because "1000" JPY is
// ¥1000, not 1000 minor units.
//
// So: an explicit ALLOW-LIST with a real rate and the correct exponent per currency. A currency we
// do not know is NOT guessed — the caller must refuse to mint and queue the donation for review.
//
// KURSY: tabela `RATES` niżej jest dziś **awaryjnym dnem**, nie źródłem prawdy. Żywe kursy idą
// z NBP (`donations/nbp.ts` + cron `api/cron/fx-rates`) i wjeżdżają tu **parametrem** `kursy` —
// dzięki temu ten moduł zostaje CZYSTY i unit-testowany bez sieci, zgodnie z konwencją repo.
// Statyczne wartości zostają jako zabezpieczenie: gdy NBP nie odpowiada, a cache jest pusty,
// wolimy policzyć grant przybliżonym kursem niż wstrzymać księgowanie wszystkich wpłat.
// Kursy służą wyłącznie do wielkości grantu waluty portalu i pasków postępu — nigdy do podania
// kwoty należnej komukolwiek.

/** PLN per 1 major unit, plus how many decimal places the currency actually has. */
type Fx = { pln: number; decimals: number };

/**
 * Known currencies. Extend deliberately — adding a row authorizes minting in that currency.
 * `decimals: 0` marks zero-decimal currencies (JPY, KRW) where "1000" means 1000 whole units.
 */
const RATES: Record<string, Fx> = {
  PLN: { pln: 1, decimals: 2 },
  EUR: { pln: 4.3, decimals: 2 },
  USD: { pln: 4.0, decimals: 2 },
  GBP: { pln: 5.1, decimals: 2 },
  CHF: { pln: 4.5, decimals: 2 },
  CZK: { pln: 0.17, decimals: 2 },
  SEK: { pln: 0.38, decimals: 2 },
  NOK: { pln: 0.38, decimals: 2 },
  DKK: { pln: 0.58, decimals: 2 },
  UAH: { pln: 0.1, decimals: 2 },
  HUF: { pln: 0.011, decimals: 2 },
  RON: { pln: 0.87, decimals: 2 },
  BGN: { pln: 2.2, decimals: 2 },
  CAD: { pln: 2.9, decimals: 2 },
  AUD: { pln: 2.6, decimals: 2 },
  BRL: { pln: 0.7, decimals: 2 },
  MXN: { pln: 0.2, decimals: 2 },
  INR: { pln: 0.048, decimals: 2 },
  TRY: { pln: 0.11, decimals: 2 },
  JPY: { pln: 0.027, decimals: 0 },
  KRW: { pln: 0.003, decimals: 0 },
};

/**
 * Is this a currency we are willing to MINT from? Unknown → caller must queue, not guess.
 *
 * @param kursy - opcjonalne żywe kursy z NBP; poszerzają listę o waluty, których nie ma w `RATES`.
 */
export function isSupportedCurrency(code: string, kursy?: Readonly<Record<string, number>>): boolean {
  const k = code.toUpperCase();
  if (kursy && typeof kursy[k] === "number" && kursy[k] > 0) return true;
  return Object.prototype.hasOwnProperty.call(RATES, k);
}

/** Minor-unit exponent for a currency (2 by default; 0 for JPY/KRW). */
export function currencyDecimals(code: string): number {
  return RATES[code.toUpperCase()]?.decimals ?? 2;
}

/**
 * Convert MINOR units of `code` into PLN major units, or `null` when the currency is unknown.
 *
 * Returning null (instead of a guess) is the whole point: an unrecognized code must downgrade the
 * donation to "needs review" rather than mint at an invented rate.
 *
 * @param kursy - żywe kursy NBP (PLN za jednostkę). Podane — MAJĄ PIERWSZEŃSTWO nad `RATES`.
 *   Pominięte lub bez tej waluty — spadamy na kurs statyczny. Parametr zamiast odczytu globalnego
 *   stanu, żeby funkcja została czysta i testowalna bez sieci.
 *
 * @remarks unit-tested in `__tests__/donations-fx.test.ts`.
 */
export function plnFromMinor(
  amountMinor: number,
  code: string,
  kursy?: Readonly<Record<string, number>>,
): number | null {
  const k = code.toUpperCase();
  const zywy = kursy?.[k];
  const fx = RATES[k];
  // Waluta znana wyłącznie z NBP nadal ma sensowny wykładnik: `currencyDecimals` zna zero-decimal
  // (JPY/KRW) z tabeli, a dla reszty 2 jest poprawne.
  const pln = typeof zywy === "number" && Number.isFinite(zywy) && zywy > 0 ? zywy : fx?.pln;
  if (pln === undefined) return null;
  if (!Number.isFinite(amountMinor) || amountMinor <= 0) return 0;
  const major = amountMinor / 10 ** (fx?.decimals ?? currencyDecimals(k));
  return major * pln;
}

/**
 * Convert a provider's decimal amount STRING/number into minor units using the currency's real
 * exponent — so "1000" JPY becomes 1000 (not 100000) and "25.00" PLN becomes 2500.
 * Returns 0 for anything non-positive or nonsensical.
 */
export function minorFromMajor(value: unknown, code: string): number {
  const n = typeof value === "number" ? value : Number(String(value ?? "").replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return 0;
  const minor = n * 10 ** currencyDecimals(code);
  if (!Number.isFinite(minor) || minor > MAX_AMOUNT_MINOR) return 0;
  return Math.round(minor);
}

/** Hard ceiling for a stored amount: `Donation.amountGrosze` is a Postgres int4. Anything above
 *  this must be REJECTED (a 4xx), never handed to Postgres — which would throw and become a 500,
 *  and a 5xx makes providers like Ko-fi retry in a loop. */
export const MAX_AMOUNT_MINOR = 2_000_000_000;
