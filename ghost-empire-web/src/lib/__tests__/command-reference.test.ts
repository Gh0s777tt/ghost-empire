// QA: user-facing copy must name the currency a feature ACTUALLY charges.
//
// Casino, wheel, duels and heists all move the `chips` column and never `tokens`, yet copy across
// several surfaces described them as costing the portal's real currency. Chips are free,
// non-purchasable and non-cashable (docs/CHIPS-CASINO.md, terms §3), so quoting a token price is
// both a mispricing and — where the string was a literal "GT" — a white-label leak of the founder
// tenant's symbol. This file guards two families of that bug; see the block comments below.
//
// Part 1 — the chat-command popover (#802). Two contracts, both really broken before (it advertised
// casino/duel/heist commands as costing "GT" while `lib/gt-games`, `lib/duels`, `lib/heist` only
// ever move `chips`):
//   1) every descKey in FEATURE_COMMANDS resolves in the reference catalog — EN is the deep-merge
//      base (src/i18n/request.ts), so a descKey missing there is a broken string in ALL 14 locales,
//   2) descriptions of chips-staking commands never name the portal's real currency. Chips are the
//      free, non-purchasable, non-cashable casino currency (docs/CHIPS-CASINO.md, terms §3) — telling
//      a viewer the spin costs %tokenName% both misprices a free game and, on someone else's portal,
//      leaks the founder tenant's "GT" (the white-label rule in CLAUDE.md, same class as #801).
//
// Contract 2 scans EVERY locale that defines the namespace, not just pl/en: only those two carry it
// today (the rest fall back to EN), but the pending i18n backfill adds the other 12 — this is what
// stops the "GT" wording from being reintroduced in twelve languages at once.
//
// Reads the catalogs from disk on purpose: the guard must cover locales added AFTER this test was
// written, which a fixed list of imports cannot do. Local JSON only — no DB, no network.
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { FEATURE_COMMANDS } from "@/lib/command-reference";
import { CHIP_SYMBOL } from "@/lib/chips";

const DIR = "src/messages";
const REFERENCE = "en";

type CommandHelp = Record<string, string>;
const catalog = (locale: string): { commandHelp?: CommandHelp } =>
  JSON.parse(readFileSync(join(DIR, `${locale}.json`), "utf8"));

/** Resolve a dotted key path ("admin.wheel.intro") in a catalog; undefined if absent. */
const at = (locale: string, path: string): unknown =>
  path.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], catalog(locale));

const locales = readdirSync(DIR)
  .filter((f) => f.endsWith(".json"))
  .map((f) => f.replace(/\.json$/, ""))
  .sort();

/**
 * Commands that stake chips: the whole `kasyno` feature (slots/coinflip/roulette/duel/accept/heist)
 * plus `cmd_bet`, the generic "bet on a casino game" line. Derived from FEATURE_COMMANDS so a newly
 * added casino command is covered without touching this test.
 */
const CHIPS_KEYS = [...new Set([...FEATURE_COMMANDS.kasyno.map((c) => c.descKey), "cmd_bet"])];

/**
 * Ways a description can end up naming the real currency: the white-label markers that
 * i18n-branding.ts expands into the tenant's token (%tokenName% / %gt%), and the literal founder
 * naming a translator may have written by hand. `\b` around GT is safe next to CJK/Arabic script —
 * JS word boundaries are defined on [A-Za-z0-9_], so "GTを" and "بـGT" still match.
 */
const REAL_CURRENCY = /%tokenName%|%gt%|\bGT\b|Ghost Token/i;

describe("FEATURE_COMMANDS ↔ commandHelp catalog", () => {
  it("every referenced descKey exists in the reference (EN) catalog", () => {
    const help = catalog(REFERENCE).commandHelp ?? {};
    const dangling = Object.values(FEATURE_COMMANDS)
      .flat()
      .map((c) => c.descKey)
      .filter((k) => !(k in help));
    expect(dangling).toEqual([]);
  });
});

describe("chips-staking commands never advertise the portal's real currency", () => {
  // One case per locale so a failure names the language that drifted.
  for (const locale of locales) {
    it(`${locale}: casino/duel/heist descriptions stay chips-only`, () => {
      const help = catalog(locale).commandHelp;
      if (!help) return; // no namespace yet → renders the (checked) EN fallback

      const offenders = CHIPS_KEYS.filter((k) => typeof help[k] === "string" && REAL_CURRENCY.test(help[k]));
      expect(offenders).toEqual([]);
    });
  }

  it("actually reads the catalogs (guards the fixture itself)", () => {
    // A typo'd path would make every case above pass vacuously.
    expect(locales).toContain(REFERENCE);
    expect(catalog(REFERENCE).commandHelp?.cmd_slots).toMatch(/chips/i);
    expect(catalog("pl").commandHelp?.cmd_slots).toMatch(/żeton/i);
  });
});

/**
 * The same contract beyond the command popover: any copy DESCRIBING a chips-funded surface must
 * not name the real currency. `lib/wheel.ts` decrements `chips` and books `currency:"CHIPS"` for
 * both the spin cost and the reward, so the admin wheel config, the onboarding tour and the
 * assistant FAQ were all quoting the wrong currency — the admin one on a surface where the
 * streamer actually SETS the price.
 *
 * `kasyno.*` / `wheel.*` (the viewer page copy) are deliberately NOT here yet: that copy is the
 * same bug on a surface being fixed separately. Add them here as soon as it lands.
 */
const CHIPS_SURFACE_KEYS = [
  "admin.wheel.costLabel",
  "admin.wheel.intro",
  "admin.wheel.statSpent",
  "admin.wheel.titleReward",
  "tour.steps.wheelSpinBody",
  "assistant.faq.casino.a",
];

describe("copy describing chips-funded surfaces never names the real currency", () => {
  for (const locale of locales) {
    it(`${locale}: wheel admin / tour / assistant copy stays chips-only`, () => {
      const offenders = CHIPS_SURFACE_KEYS.filter((k) => {
        const v = at(locale, k);
        return typeof v === "string" && REAL_CURRENCY.test(v);
      });
      expect(offenders).toEqual([]);
    });
  }

  // tokensBody is the exception that proves the rule: it legitimately names %gt% (it describes the
  // GT balance), but it also lists where GT is spent — and it used to list the casino and the
  // wheel, which take chips. It must therefore disclose the separate chips currency.
  it("the tour's GT-balance step discloses that casino/wheel run on chips", () => {
    const missing = locales.filter((l) => {
      const v = at(l, "tour.steps.tokensBody");
      return typeof v === "string" && !v.includes(CHIP_SYMBOL);
    });
    expect(missing).toEqual([]);
  });

  it("actually reads the fixtures (a typo'd path would pass vacuously)", () => {
    expect(at(REFERENCE, "admin.wheel.costLabel")).toContain(CHIP_SYMBOL);
    expect(at("pl", "tour.steps.wheelSpinBody")).toMatch(/żeton/i);
  });
});
