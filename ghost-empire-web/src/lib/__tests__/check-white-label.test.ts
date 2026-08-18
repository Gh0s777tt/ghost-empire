// src/lib/__tests__/check-white-label.test.ts
// Testy strażnika white-label (scripts/check-white-label.mjs). Bramka, która ma
// pilnować marki, sama musi być pilnowana: fałszywy alarm blokuje CI wszystkim, a
// przeoczenie przepuszcza dokładnie tę klasę dryfu, dla której powstała (#801 —
// `amountLabel: "GT"` w pięciu miejscach naraz).
//
// Testujemy ZACHOWANIE (co jest wyciekiem, a co nie), nie implementację regexa.
import { describe, it, expect } from "vitest";

type Violation = { rel: string; line: number; field: string; literal: string };
type ScanResult = { errors: Violation[]; warnings: Violation[] };

// Specyfikator liczony w runtime: skrypt to .mjs poza `src/`, więc statyczny import
// nie przeszedłby `tsc --noEmit` (brak typów). Dynamiczny import daje `any`.
const { scanSource } = (await import(
  new URL("../../../scripts/check-white-label.mjs", import.meta.url).href
)) as { scanSource: (rel: string, text: string) => ScanResult };

/** Ścieżka „zwykłego" pliku aplikacji — nie objęta żadną allowlistą. */
const APP = "src/app/api/shop/buy/route.ts";

describe("check-white-label — twarda bramka", () => {
  it("łapie regresję #801: amountLabel zaszyty jako symbol foundera", () => {
    const { errors } = scanSource(APP, `      amountLabel: "GT",`);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ field: "amountLabel", literal: "GT", line: 1 });
  });

  it("łapie każdą stałą foundera, nie tylko symbol waluty", () => {
    for (const literal of ["Ghost Tokens", "Ghost Empire", "GH0ST EMPIRE", "Gh0s77tt"]) {
      expect(scanSource(APP, `  brand: "${literal}",`).errors).toHaveLength(1);
    }
  });

  it("łapie handle/zaproszenie foundera także wewnątrz dłuższego literału (URL)", () => {
    expect(scanSource(APP, `  href: "https://twitch.tv/gh0s77tt",`).errors).toHaveLength(1);
    expect(scanSource(APP, `  invite: "https://discord.gg/deAPJ9Ym2F",`).errors).toHaveLength(1);
  });

  it("łapie przypisanie do zmiennej i atrybut JSX, nie tylko pole obiektu", () => {
    expect(scanSource(APP, `const symbol = "GT";`).errors).toHaveLength(1);
    expect(scanSource("src/components/X.tsx", `<Badge label="GT" />`).errors).toHaveLength(1);
  });

  it("łapie stałą foundera jako ARGUMENT wywołania, nie tylko przypisanie", () => {
    // Druga realna droga tekstu do widza — bez tego bramka dawała fałszywe pokrycie.
    expect(scanSource(APP, `  return jsonError("GT", 400);`).errors).toHaveLength(1);
    expect(scanSource(APP, `  throw new ClanError("Ghost Tokens", 400);`).errors).toHaveLength(1);
    expect(scanSource(APP, `  dispatchAlert("Ghost Empire");`).errors).toHaveLength(1);
  });

  it("nie zgłasza tego samego literału dwa razy (dwa matchery, jedno trafienie)", () => {
    expect(scanSource(APP, `  amountLabel: "GT",`).errors).toHaveLength(1);
  });

  it("podpowiada per-tenantowe źródło zamiast literału", () => {
    const { errors } = scanSource(APP, `  amountLabel: "GT",`);
    expect(errors[0]).toHaveProperty("use", expect.stringContaining("tokenSymbol"));
  });
});

describe("check-white-label — legalne przypadki (allowlisty z CLAUDE.md)", () => {
  it("przepuszcza dyskryminator ledgera `currency: \"GT\"` (klucz danych, nie tekst)", () => {
    expect(scanSource(APP, `  where: { currency: "GT" },`).errors).toHaveLength(0);
  });

  it("przepuszcza jawny fallback `x || \"GT\"` / `x ?? \"Ghost Tokens\"`", () => {
    expect(scanSource(APP, `  tokenSymbol: t.tokenSymbol || "GT",`).errors).toHaveLength(0);
    expect(scanSource(APP, `  tokenName: t.tokenName ?? "Ghost Tokens",`).errors).toHaveLength(0);
  });

  it("przepuszcza podpowiedź `placeholder` w panelu admina", () => {
    expect(scanSource("src/components/admin/sections/Tenants.tsx", `<FieldInput placeholder="GT" />`).errors)
      .toHaveLength(0);
  });

  it("przepuszcza pozycję TYPU (union/alias), bo to kształt danych", () => {
    expect(scanSource(APP, `export type LedgerCurrency = "GT" | "CHIPS";`).errors).toHaveLength(0);
  });

  it("przepuszcza udokumentowane źródła fallbacku (site.ts / tenant.ts / SOCIALS)", () => {
    expect(scanSource("src/lib/site.ts", `  shortName: "Ghost Empire",`).errors).toHaveLength(0);
    expect(scanSource("src/lib/tenant.ts", `  tokenSymbol: "GT",`).errors).toHaveLength(0);
    expect(scanSource("src/components/SocialLinks.tsx", `  href: "https://twitch.tv/gh0s77tt",`).errors)
      .toHaveLength(0);
  });

  it("nie skanuje i18n, testów ani founder-voiced feedu `about`", () => {
    expect(scanSource("src/messages/pl.json", `  "x": "GT",`).errors).toHaveLength(0);
    expect(scanSource("src/lib/__tests__/foo.test.ts", `  tokenSymbol: "GT",`).errors).toHaveLength(0);
    expect(scanSource("src/app/[locale]/about/page.tsx", `  title: "Podwójne GT 🔥",`).errors).toHaveLength(0);
  });

  it("nie czerwieni się od KOMENTARZA opisującego zaszytą markę", () => {
    // Komentarz wyjaśniający jest dokumentacją, nie wyciekiem — inaczej nie dałoby się
    // opisać poprawki bez zepsucia bramki (realnie wywróciło to RankingClient.tsx).
    const src = [
      `// zastąpiono sentinel \`suffix: "GT"\` flagą isCurrency`,
      `/** Kiedyś było tu tokenName: "Ghost Tokens". */`,
      `  isCurrency: true,`,
    ].join("\n");
    expect(scanSource(APP, src).errors).toHaveLength(0);
  });
});

describe("check-white-label — tier ostrzeżeń (proza)", () => {
  it("stała foundera w prozie ostrzega, ale NIE blokuje", () => {
    const { errors, warnings } = scanSource(APP, "  message: `Otrzymałeś ${n} GT.`,");
    expect(errors).toHaveLength(0);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({ field: "message" });
  });

  it("proza w wywołaniu emitującym komunikat ostrzega (jsonError/*Error/push)", () => {
    const { errors, warnings } = scanSource(APP, `  return jsonError("Nieprawidłowa ilość GT", 400);`);
    expect(errors).toHaveLength(0);
    expect(warnings).toHaveLength(1);
  });

  it("proza w wywołaniu NIE-komunikatowym (log) jest ignorowana", () => {
    // console/logger biorą stringi, ale log nie jest powierzchnią white-label —
    // szeroka reguła zalałaby raport szumem.
    expect(scanSource(APP, "  console.warn(`awarded ${n} GT`);").warnings).toHaveLength(0);
    expect(scanSource(APP, `  const log = createLogger("gt-games");`).warnings).toHaveLength(0);
  });

  it("proza bez marki foundera nie generuje niczego", () => {
    const res = scanSource(APP, "  message: `Otrzymałeś ${n} ${tokenSymbol}.`,");
    expect(res.errors).toHaveLength(0);
    expect(res.warnings).toHaveLength(0);
  });

  it("GT wewnątrz innego słowa nie jest trafieniem (granica słowa)", () => {
    expect(scanSource(APP, "  message: `Gramy w GTA V dziś.`,").warnings).toHaveLength(0);
  });

  it("marker `// wl-ok: <powód>` wyłącza linię spod bramki (enum waluty, nie display)", () => {
    // Kontrola: BEZ markera dyskryminant enuma w argumencie wywołania jest twardym wyciekiem…
    const bez = scanSource(APP, `  const r = reasonsFor("GT");`);
    expect(bez.errors).toHaveLength(1);
    // …a Z markerem (z powodem) linia jest świadomie pominięta.
    const zMarkerem = scanSource(APP, `  const r = reasonsFor("GT"); // wl-ok: dyskryminant enuma waluty`);
    expect(zMarkerem.errors).toHaveLength(0);
    expect(zMarkerem.warnings).toHaveLength(0);
  });
});
