// src/__tests__/kickSelfEcho.test.ts
// Pilnuje self-echo guarda Kicka (src/kick.ts). Kick — inaczej niż Twitch (flaga `self`,
// twitch.ts:47) i YouTube (channelId !== ownChannelId, youtube.ts:138) — dostaje WŁASNE
// odpowiedzi bota z powrotem po tym samym feedzie Pushera. Zanim guard powstał, jedynym
// checkiem tożsamości było `userId !== env.kick.broadcasterId`, które wyklucza STREAMERA,
// nie bota: bot pisze type:"user" NA kanał broadcastera, ale pod swoim własnym user id.
//
// Dlaczego akurat ten predykat ma test, a nie "czy websocket działa": to on decyduje, czy
// KONTO BOTA dostaje 1 token/min za własne gadanie (inflacja ekonomii tenanta) i czy bot
// odpowiada sam sobie na słowo-klucz FAQ (pętla bot→bot). Ścieżka pieniężna ⇒ test.
//
// Runner: wbudowany runner Node przez tsx (`npm test`) — świadomie bez vitesta, jak
// branding.test.ts i README.md.
import { test, describe } from "node:test";
import assert from "node:assert/strict";

// env.ts's req() throws on missing vars at import time, so these must exist before the
// first import of kick.ts (dotenv does not override already-set values).
process.env.PORTAL_URL = "https://neo-zone.example.test";
process.env.BOT_SECRET = "test-secret";
process.env.TWITCH_BOT_USERNAME = "TestBot";
process.env.TWITCH_CHANNEL = "test_channel";

// Bez rozszerzenia — tak importuje cały pakiet (moduleResolution: "bundler"). Ścieżka
// z ".ts" wywala `tsc --noEmit` na TS5097, mimo że tsx zjada ją w runtime bez mrugnięcia.
const { isSelfEcho, rememberSelfSent, SELF_ECHO_WINDOW_MS } = await import("../kick");

/** Realne id-ki: bot i streamer to DWA różne konta — to sedno starego błędu. */
const BOT_ID = "9001";
const BROADCASTER_ID = "4242";
const VIEWER_ID = "777";

/** Świeża mapa fallbacku na każdy przypadek — inaczej testy przeciekałyby wzajemnie. */
function sent(entries: Array<[string, number]> = []): Map<string, number> {
  return new Map(entries);
}

describe("self-echo guard — id bota znane (ścieżka normalna)", () => {
  test("wiadomość spod id bota jest odrzucana", () => {
    assert.equal(
      isSelfEcho(BOT_ID, "Zgarniaj tokeny na portalu!", { botUserId: BOT_ID, recentSent: sent() }),
      true,
    );
  });

  test("REGRESJA: bot NIE jest broadcasterem — check broadcasterId nigdy nie łapał echa", () => {
    // Dokładnie ta konfiguracja przepuszczała echo do nagród: id bota ≠ broadcasterId,
    // więc stary `if (userId !== env.kick.broadcasterId)` był prawdziwy i konto bota
    // dostawało tokeny za własną wiadomość.
    assert.notEqual(BOT_ID, BROADCASTER_ID);
    assert.equal(isSelfEcho(BOT_ID, "cokolwiek", { botUserId: BOT_ID, recentSent: sent() }), true);
  });

  test("streamer i widz przechodzą dalej", () => {
    const opts = { botUserId: BOT_ID, recentSent: sent() };
    assert.equal(isSelfEcho(BROADCASTER_ID, "siema", opts), false);
    assert.equal(isSelfEcho(VIEWER_ID, "siema", opts), false);
  });

  test("brak id nadawcy nie jest botem (malformed payload nie ucisza czatu)", () => {
    assert.equal(isSelfEcho(undefined, "siema", { botUserId: BOT_ID, recentSent: sent() }), false);
  });

  test("id bota jest AUTORYTATYWNE — widz cytujący bota nie zostaje uciszony", () => {
    const recentSent = sent();
    rememberSelfSent(recentSent, "Zgarniaj tokeny na portalu!", 1_000);
    assert.equal(
      isSelfEcho(VIEWER_ID, "Zgarniaj tokeny na portalu!", { botUserId: BOT_ID, recentSent, now: 1_100 }),
      false,
    );
  });
});

describe("self-echo guard — id bota nieznane (degradacja, nie crash)", () => {
  test("echo świeżo wysłanej treści jest odrzucane", () => {
    const recentSent = sent();
    rememberSelfSent(recentSent, "Loteria wystartowała — pisz !loteria", 1_000);
    assert.equal(
      isSelfEcho(BOT_ID, "Loteria wystartowała — pisz !loteria", { botUserId: null, recentSent, now: 2_000 }),
      true,
    );
  });

  test("treść, której nie wysyłaliśmy, przechodzi dalej", () => {
    const recentSent = sent();
    rememberSelfSent(recentSent, "Loteria wystartowała — pisz !loteria", 1_000);
    assert.equal(isSelfEcho(VIEWER_ID, "!loteria", { botUserId: null, recentSent, now: 2_000 }), false);
  });

  test("poza oknem echa treść znów przechodzi (widz nie jest uciszony na zawsze)", () => {
    const recentSent = sent();
    rememberSelfSent(recentSent, "siema wszystkim", 1_000);
    const opts = { botUserId: null, recentSent };
    assert.equal(isSelfEcho(VIEWER_ID, "siema wszystkim", { ...opts, now: 1_000 + SELF_ECHO_WINDOW_MS }), true);
    assert.equal(isSelfEcho(VIEWER_ID, "siema wszystkim", { ...opts, now: 1_000 + SELF_ECHO_WINDOW_MS + 1 }), false);
  });

  test("pusta mapa = nic nie jest echem (bot bez tokenu nic nie wysyła)", () => {
    assert.equal(isSelfEcho(VIEWER_ID, "siema", { botUserId: null, recentSent: sent() }), false);
    assert.equal(isSelfEcho(undefined, "", { botUserId: null, recentSent: sent() }), false);
  });

  test("klucz normalizuje się tak, jak Kick zwraca treść (obcięcie do 500 znaków)", () => {
    // sendKickMessage wysyła content.slice(0, 500) — echo wraca obcięte, więc dłuższy
    // oryginał i jego echo muszą trafić na ten sam klucz.
    const long = "x".repeat(600);
    const recentSent = sent();
    rememberSelfSent(recentSent, long, 1_000);
    assert.equal(isSelfEcho(BOT_ID, long.slice(0, 500), { botUserId: null, recentSent, now: 1_500 }), true);
  });
});
