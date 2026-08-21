// Wykrywanie LUKI w pollowaniu wpłat — kiedy sufit okna po cichu zjada donacje.
//
// Tło: `pollSince` bierze `max(createdAt, now - maxLookback, lastEventAt - grace)`. Gdy poller nie
// chodził dłużej niż okno (leżąca baza, padający cron, integracja wisząca na błędzie), to
// `now - maxLookback` wygrywa z kursorem — a wpłaty z luki między kursorem a sufitem `selectFresh`
// odrzuca. Poll kończy się wtedy `ok` z `ingested: 0`, **nie do odróżnienia od „nikt nic nie
// wpłacił"**. Znalezione przy realnej awarii bazy (wstrzymane projekty Supabase).
//
// `pominietoMs` nie zmienia księgowania — mierzy tę lukę, żeby wywołujący mógł o niej krzyknąć.
// Testy pilnują, żeby nie krzyczał, gdy luki nie ma (fałszywy alarm przy każdym pollu byłby gorszy
// niż cisza), i żeby krzyczał, gdy jest.
import { describe, it, expect } from "vitest";
import {
  pominietoMs, pollSince, selectFresh, CURSOR_GRACE_MS, DEFAULT_MAX_LOOKBACK_MS,
} from "@/lib/donations/cursor";
import { tipplyPominietoMs, TIPPLY_MAX_LOOKBACK_MS } from "@/lib/donations/tipply";

const TERAZ = new Date("2026-08-20T12:00:00Z");
const godz = (h: number) => new Date(TERAZ.getTime() - h * 3_600_000);

describe("pominietoMs — czy sufit okna coś uciął", () => {
  it("brak kursora = pierwszy poll, nie ma czego gubić", () => {
    expect(pominietoMs(null, TERAZ)).toBe(0);
  });

  it("świeży kursor nie generuje fałszywego alarmu", () => {
    // Alarm przy każdym normalnym pollu byłby gorszy niż cisza — zagłuszyłby ten prawdziwy.
    for (const h of [0, 1, 6, 11]) {
      expect(pominietoMs(godz(h), TERAZ), `kursor sprzed ${h} h`).toBe(0);
    }
  });

  it("kursor dokładnie na granicy okna (z zapasem) jeszcze nie alarmuje", () => {
    const naGranicy = new Date(TERAZ.getTime() - DEFAULT_MAX_LOOKBACK_MS + CURSOR_GRACE_MS);
    expect(pominietoMs(naGranicy, TERAZ)).toBe(0);
  });

  it("kursor za oknem daje lukę równą przekroczeniu", () => {
    // 24 h wstecz przy oknie 12 h i zapasie 30 min: sufit = -12 h, kursor = -24,5 h → luka 12,5 h.
    const luka = pominietoMs(godz(24), TERAZ);
    expect(luka).toBe(12 * 3_600_000 + CURSOR_GRACE_MS);
  });

  it("im dłuższa przerwa, tym większa luka", () => {
    expect(pominietoMs(godz(48), TERAZ)).toBeGreaterThan(pominietoMs(godz(24), TERAZ));
  });

  it("Tipply liczy to samo swoim oknem", () => {
    expect(TIPPLY_MAX_LOOKBACK_MS).toBe(DEFAULT_MAX_LOOKBACK_MS);
    expect(tipplyPominietoMs(godz(24), TERAZ)).toBe(pominietoMs(godz(24), TERAZ));
    expect(tipplyPominietoMs(null, TERAZ)).toBe(0);
  });
});

// Sedno: luka > 0 znaczy, że REALNE wpłaty wypadną. Ten test wiąże miarę ze skutkiem, zamiast
// sprawdzać samą arytmetykę — inaczej `pominietoMs` mogłoby mierzyć coś, co nikogo nie dotyczy.
describe("luka a faktyczna utrata wpłat", () => {
  const wplata = (h: number) => ({ donatedAt: godz(h) });

  it("gdy luka > 0, wpłaty z luki są ODRZUCANE przez selectFresh", () => {
    const kursor = godz(24);
    expect(pominietoMs(kursor, TERAZ)).toBeGreaterThan(0);

    const since = pollSince(new Date("2020-01-01"), kursor, TERAZ);
    const wplaty = [wplata(20), wplata(18), wplata(2)]; // dwie pierwsze w luce
    const przeszly = selectFresh(wplaty, since);

    expect(przeszly).toHaveLength(1);
    expect(przeszly[0].donatedAt.getTime()).toBe(godz(2).getTime());
  });

  it("gdy luki nie ma, nic nie wypada", () => {
    const kursor = godz(6);
    expect(pominietoMs(kursor, TERAZ)).toBe(0);
    const since = pollSince(new Date("2020-01-01"), kursor, TERAZ);
    expect(selectFresh([wplata(5), wplata(1)], since)).toHaveLength(2);
  });

  it("pierwszy poll świeżej integracji nie alarmuje, choć okno ucina historię", () => {
    // `createdAt` teraz + brak kursora: sufit i tak obcina stare wpłaty, ale to jest ZAMIERZONE
    // (nie odtwarzamy historii na wizji), więc nie ma o czym krzyczeć.
    expect(pominietoMs(null, TERAZ)).toBe(0);
    const since = pollSince(TERAZ, null, TERAZ);
    expect(selectFresh([wplata(20)], since)).toHaveLength(0);
  });
});
