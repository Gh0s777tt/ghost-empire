// src/lib/shop-currency.ts
// The "chips buy cosmetics only" invariant, as code instead of a comment. A `ShopItem` is
// paid for in one of two currencies: GT — the purchasable, donation-fed, per-tenant
// real-value economy — or CHIPS, the free, non-purchasable, non-cashable casino currency
// (see docs/CHIPS-CASINO.md). Chips may only ever buy a **cosmetic**.
//
// Why this is money/legally critical: the casino stays out of the Ustawa o grach hazardowych
// only because the value loop is cut — a random stake goes in, nothing of market value comes
// out. A CHIPS item in any real-value category (`games` / `skins` / `subs` / `experience` —
// Steam keys, CS2 skins, gifted subs, meetups) re-closes that loop: chips won at the roulette
// table would buy something worth real money, i.e. exactly the payout the chips migration was
// built to remove. It would also let a player convert a free daily grant into real value,
// which no amount of downstream accounting can undo.
//
// Until now the rule lived in a comment in `shop/buy` and was upheld only by seed discipline —
// nothing stopped an owner from flipping a seeded CHIPS cosmetic to `category:"games"` in the
// admin panel. This module makes it a pure, DB-free, unit-testable predicate so every writer
// (seed, admin API) and the read path (`shop/buy`) can fail closed on it.
//
// The invariant in one line: `currency === "CHIPS"` ⇒ `category === "cosmetic"`.
// Note it is an **allowlist**: a category added later (say `"hardware"`) is forbidden for chips
// by default, so a new real-value category can never silently re-open the loop.

/**
 * The two shop currencies. Mirrors `LedgerCurrency` in `lib/refund.ts` — the ledger and the
 * catalog must agree on what a currency string means or refunds mint the wrong money.
 */
export type ShopCurrency = "GT" | "CHIPS";

/** Both currencies, in UI order (real-value first). Drives the admin picker. */
export const SHOP_CURRENCIES: readonly ShopCurrency[] = ["GT", "CHIPS"];

/**
 * Display symbol for the free casino chips.
 *
 * @remarks
 * Deliberately **not** white-labelled. A tenant renames its own token
 * (`tokenName`/`tokenSymbol`), but chips are the platform-wide, value-less casino currency —
 * every portal's chips are the same thing, and the legal copy (`terms` §3, `GamblingGate`)
 * talks about "żetony 🪙" universally. Same literal the casino and wheel clients use.
 */
export const CHIP_SYMBOL = "🪙";

/**
 * The only `ShopItem.category` a CHIPS item may carry.
 *
 * @remarks
 * `"cosmetic"` is also the category `shop/buy` treats as instantly deliverable (`isDigital`)
 * — no ticket, no shipping, nothing an admin could hand over off-platform. That overlap is
 * intentional: a cosmetic has nothing to deliver *because* it has no market value.
 */
export const CHIPS_ONLY_CATEGORY = "cosmetic";

/**
 * Coerce a raw `currency` value into a known {@link ShopCurrency}.
 *
 * @param raw - `ShopItem.currency` from the DB, or a value off an admin request body.
 * @returns `"CHIPS"` only for the exact `"CHIPS"` sentinel; **everything else** (`"GT"`,
 *   `null`, `undefined`, `"chips"`, garbage) becomes `"GT"`.
 *
 * @remarks
 * Biasing unknown values to GT is the safe default and matches how `shop/buy`
 * (`item.currency === "CHIPS"`) and `planRefund` already read the field: an unrecognised
 * value is a legacy/misspelled row, and treating it as real GT means we *charge* real
 * currency rather than accidentally letting free chips through. Never invert this.
 */
export function normalizeShopCurrency(raw: string | null | undefined): ShopCurrency {
  return raw === "CHIPS" ? "CHIPS" : "GT";
}

/**
 * Is this item paid for with the free casino chips?
 *
 * @param raw - `ShopItem.currency` (or a request-body value).
 * @returns `true` only for the exact `"CHIPS"` sentinel — case-sensitive, mirroring
 *   `shop/buy` and `planRefund` so no two paths can disagree about a row.
 */
export function isChipsCurrency(raw: string | null | undefined): boolean {
  return normalizeShopCurrency(raw) === "CHIPS";
}

/** Result of {@link checkCurrencyCategory}: either valid, or invalid with an admin-facing reason. */
export type CurrencyCategoryCheck =
  | { ok: true }
  | {
      ok: false;
      /** Polish, admin-facing reason — safe to return straight as a 400 body (no brand/token leak). */
      error: string;
    };

/**
 * Check the currency ⇒ category invariant for a shop item's **final** state.
 *
 * @param currency - The currency the item will be sold in (`ShopItem.currency`). Anything
 *   that isn't the exact `"CHIPS"` sentinel counts as GT (see {@link normalizeShopCurrency}),
 *   so an unknown value can never *bypass* the check by being unrecognised — it just lands on
 *   the unrestricted GT branch, where every category is legitimate.
 * @param category - The category the item will have (`ShopItem.category`).
 * @returns `{ ok: true }` when the pair is allowed, otherwise `{ ok: false, error }` with a
 *   ready-to-return message.
 *
 * @remarks
 * Callers must validate the **resolved** state, not just the changed field: on a partial
 * update, a request that only changes `category` still has to be checked against the item's
 * *stored* currency (flipping an existing CHIPS cosmetic to `"games"` is the same leak as
 * creating a CHIPS game outright).
 *
 * @example
 * ```ts
 * checkCurrencyCategory("CHIPS", "cosmetic"); // → { ok: true }
 * checkCurrencyCategory("CHIPS", "games");    // → { ok: false, error: "Itemy za żetony…" }
 * checkCurrencyCategory("GT", "games");       // → { ok: true } — GT buys real value by design
 * ```
 */
export function checkCurrencyCategory(
  currency: string | null | undefined,
  category: string | null | undefined,
): CurrencyCategoryCheck {
  // GT items are unrestricted: buying real-value goods with the real-value currency is the
  // whole point of the shop (direct purchase, no randomness = trade, not gambling).
  if (!isChipsCurrency(currency)) return { ok: true };

  if (category === CHIPS_ONLY_CATEGORY) return { ok: true };

  return {
    ok: false,
    error:
      `Item za żetony (currency:"CHIPS") musi mieć category:"${CHIPS_ONLY_CATEGORY}" ` +
      `(otrzymano: "${category ?? "brak"}") — żetony są darmowe i nie mogą kupować rzeczy ` +
      `o wartości rynkowej.`,
  };
}

/** Thrown by {@link assertCurrencyCategoryValid} when a writer would persist a CHIPS non-cosmetic. */
export class ShopCurrencyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ShopCurrencyError";
  }
}

/**
 * Throwing form of {@link checkCurrencyCategory}, for writers with no HTTP response to shape
 * (seeds, scripts, migrations) — a violation should abort the whole write loudly rather than
 * land a real-value CHIPS item in the catalog.
 *
 * @param currency - The currency the item will be sold in.
 * @param category - The category the item will have.
 * @throws {ShopCurrencyError} when `currency` is CHIPS and `category` isn't
 *   {@link CHIPS_ONLY_CATEGORY}.
 */
export function assertCurrencyCategoryValid(
  currency: string | null | undefined,
  category: string | null | undefined,
): void {
  const check = checkCurrencyCategory(currency, category);
  if (!check.ok) throw new ShopCurrencyError(check.error);
}
