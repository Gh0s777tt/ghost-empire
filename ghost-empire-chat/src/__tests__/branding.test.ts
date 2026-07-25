// Testy białej etykiety dla tekstu bota widocznego dla widza.
//
// Dwa poziomy, bo dwie różne rzeczy mogą się zepsuć:
//  1. branding.ts — czy waluta portalu w ogóle dojeżdża do tekstu i czy awaria
//     portalu NIE wraca do „Ghost Tokens”/„GT” (to byłby ten sam wyciek),
//  2. scripts/check-white-label.mjs — czy bramka faktycznie łapie wyciek; zielony
//     skaner z zepsutym matcherem jest gorszy niż brak skanera (fałszywe „czysto”).
//
// `fetch` podmieniamy przez vi.stubGlobal — bez sieci, zgodnie z konwencją repo
// (czysta logika testowana bez mocków bazy/sieci; tu sieć to jedyne wejście).
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

// env.ts woła req("PORTAL_URL") przy imporcie — ustaw ZANIM zaimportujemy branding.
process.env.PORTAL_URL = "https://neo-zone.example.com";
process.env.BOT_SECRET = "test-secret";
process.env.TWITCH_BOT_USERNAME = "TestBot";
process.env.TWITCH_CHANNEL = "testchannel";

const { refreshBranding, tokenName, tokenSymbol, _setBranding } = await import("../branding");
const { matchCommand } = await import("../commands");
const { scanText, extractLiterals } = await import("../../scripts/check-white-label.mjs");

/** Skrót: udawany fetch zwracający dane JSON z zadanym statusem. */
function stubFetch(body: unknown, ok = true, status = 200) {
  const spy = vi.fn(async () => ({ ok, status, json: async () => body }));
  vi.stubGlobal("fetch", spy);
  return spy;
}

beforeEach(() => {
  _setBranding(null); // wróć do neutralnego fallbacku
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("branding: waluta portalu w tekście dla widza", () => {
  it("bierze tokenName/tokenSymbol z portalu tego tenanta", async () => {
    stubFetch({ name: "Neo Zone", tokenName: "Neo Coins", tokenSymbol: "NC" });
    await expect(refreshBranding()).resolves.toBe(true);
    expect(tokenName()).toBe("Neo Coins");
    expect(tokenSymbol()).toBe("NC");
  });

  it("pyta o branding WŁASNEGO portalu (host rozstrzyga tenanta)", async () => {
    const spy = stubFetch({ tokenName: "Neo Coins", tokenSymbol: "NC" });
    await refreshBranding();
    expect(spy).toHaveBeenCalledWith(
      "https://neo-zone.example.com/api/companion/branding",
      expect.anything(),
    );
  });

  it("fallback przy niedostępnym portalu jest BEZ marki foundera", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("ECONNREFUSED"); }));
    await expect(refreshBranding()).resolves.toBe(false);
    // Sedno całej zmiany: awaria NIE może wrócić do waluty foundera.
    expect(tokenName()).not.toMatch(/ghost\s*tokens?/i);
    expect(tokenSymbol()).not.toMatch(/^GT$/);
    expect(tokenName()).toBe("tokeny");
    expect(tokenSymbol()).toBe("pkt");
  });

  it("zachowuje poprzednią walutę, gdy portal odpowie błędem", async () => {
    stubFetch({ tokenName: "Neo Coins", tokenSymbol: "NC" });
    await refreshBranding();
    stubFetch({}, false, 503);
    await expect(refreshBranding()).resolves.toBe(false);
    expect(tokenName()).toBe("Neo Coins"); // nie cofa się do neutralnego
  });

  it("odrzuca połowiczny payload — nazwa bez symbolu byłaby niespójna", async () => {
    stubFetch({ tokenName: "Neo Coins" });
    await expect(refreshBranding()).resolves.toBe(false);
    expect(tokenName()).toBe("tokeny");
  });

  it("czyści CR/LF z wartości — trafia prosto w ramkę IRC PRIVMSG", async () => {
    stubFetch({ tokenName: "Neo\r\nCoins", tokenSymbol: " NC " });
    await refreshBranding();
    expect(tokenName()).toBe("Neo Coins");
    expect(tokenSymbol()).toBe("NC");
  });

  it("odrzuca absurdalnie długą nazwę zamiast wypluć ją na czat", async () => {
    stubFetch({ tokenName: "x".repeat(200), tokenSymbol: "NC" });
    await expect(refreshBranding()).resolves.toBe(false);
    expect(tokenName()).toBe("tokeny");
  });
});

describe("fallbackowa lista komend (portal jeszcze nie odpowiedział)", () => {
  // matchCommand ma cooldown 15 s per trigger, a mapa `lastUsed` żyje w module przez
  // CAŁY plik testowy. Zegar musi więc rosnąć monotonicznie MIĘDZY testami, a
  // useFakeTimers() resetuje bazę do realnego „teraz" — stąd własny, absolutny zegar.
  let clock = Date.UTC(2030, 0, 1);
  const past = () => {
    clock += 60_000;
    vi.setSystemTime(clock);
  };

  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  // Regresja: lista była modułowym `const` z template-literalami, więc budowała się
  // przy imporcie — ZANIM branding dojechał — i na zawsze zostawała przy fallbacku.
  it("używa waluty ustawionej PO imporcie modułu", () => {
    _setBranding({ tokenName: "Neo Coins", tokenSymbol: "NC" });
    past();
    expect(matchCommand("!portal")).toContain("Neo Coins");
  });

  it("przebudowuje się, gdy waluta zmieni się w trakcie procesu", () => {
    _setBranding({ tokenName: "Neo Coins", tokenSymbol: "NC" });
    past();
    expect(matchCommand("!sklep")).toContain("Neo Coins");
    _setBranding({ tokenName: "Void Bits", tokenSymbol: "VB" });
    past();
    expect(matchCommand("!sklep")).toContain("Void Bits");
  });

  it("fallback bez portalu nie nazywa waluty foundera", () => {
    _setBranding(null);
    past();
    const portal = matchCommand("!portal");
    expect(portal).not.toMatch(/ghost\s*tokens?/i);
    expect(portal).toContain("tokeny");
  });
});

describe("bramka check-white-label: musi ŁAPAĆ wyciek", () => {
  it("łapie markę w argumencie wywołania (broadcast) — nie tylko w przypisaniu", () => {
    const src = 'await broadcast(`obstawiaj Ghost Tokens na ${env.portalUrl}`);';
    expect(scanText(src)).toHaveLength(1);
  });

  it("łapie symbol w kawałku templatki rozbitym przez ${…}", () => {
    const src = "const pot = ` Pula: ${total} GT.`;";
    expect(scanText(src)).toHaveLength(1);
  });

  it("łapie zwykłe przypisanie i literał w obiekcie", () => {
    expect(scanText('const a = { response: "Wydaj GT w sklepie" };')).toHaveLength(1);
  });

  it("IGNORUJE komentarze — to one są większością surowych trafień grepa", () => {
    const src = [
      "// all GT math lives server-side in lib/heist.ts",
      "/* Ghost Tokens are awarded per minute; Ghost Empire is the founder tenant */",
      "const x = 1;",
    ].join("\n");
    expect(scanText(src)).toHaveLength(0);
  });

  it("IGNORUJE console.* — stdout leci do operatora, nie do widza", () => {
    expect(scanText('console.log("[ghost-empire-chat] GT award ok");')).toHaveLength(0);
  });

  it("respektuje wyłącznik white-label-ok", () => {
    expect(scanText('const s = "napad na GT"; // white-label-ok')).toHaveLength(0);
  });

  it("nie myli identyfikatora w kodzie z tekstem", () => {
    expect(scanText("export function handleGtGame(gtAmount: number) { return gtAmount; }")).toHaveLength(0);
  });

  it("regex z cudzysłowem nie rozjeżdża tokenizera", () => {
    // Gdyby /["']/ otworzył fałszywy string, kolejny literał zostałby połknięty.
    const src = ['const re = /["\']/;', 'const leak = "pojedynek na GT";'].join("\n");
    const found = scanText(src);
    expect(found).toHaveLength(1);
    expect(found[0].line).toBe(2);
  });

  it("nie traktuje wnętrza ${…} jako tekstu", () => {
    expect(extractLiterals("`${env.portalUrl}/shop`").map((l: { text: string }) => l.text)).toEqual(["/shop"]);
  });

  it("aktualne źródła bota są czyste", async () => {
    const { readFileSync, readdirSync } = await import("node:fs");
    const { join } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    // fileURLToPath, nie URL.pathname — ścieżka repo zawiera spacje (%20).
    const dir = fileURLToPath(new URL("..", import.meta.url));
    const findings = readdirSync(dir)
      .filter((f) => f.endsWith(".ts"))
      .flatMap((f) => scanText(readFileSync(join(dir, f), "utf8"), f));
    expect(findings).toEqual([]);
  });
});
