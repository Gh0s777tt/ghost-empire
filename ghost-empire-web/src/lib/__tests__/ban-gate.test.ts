// Dwie bramki logowania z lib/auth.ts, obie czysto obliczeniowe (bez DB), obie po audycie:
//
//  1. isBanActive — JEDNO źródło prawdy o banie dla OBU ścieżek sign-in: callbacku signIn
//     (OAuth) i trasy api/auth/passkey/login/verify, która tworzy Session sama z siebie.
//     Passkey tej bramki nie miał w ogóle, więc zbanowany użytkownik z zarejestrowanym
//     passkeyem logował się z powrotem na pełną ekonomię.
//  2. isPermanentAdminEmail — lista permanentnych adminów. Wcześniej powstawała jako
//     Set([<hardcoded literał>, ...ADMIN_EMAILS]), czyli konfiguracja mogła tylko DODAWAĆ
//     i nigdy nie usunęła publicznie znanego adresu właściciela.
//
// next-auth i providerzy są zamockowani, bo import "@/lib/auth" wykonuje całą konfigurację
// NextAuth przy ładowaniu modułu — nic z niej nie jest przedmiotem tych testów.
import { describe, it, expect, vi } from "vitest";

vi.hoisted(() => {
  // Ustawione PRZED importem modułu — lista adminów jest rozwiązywana raz, przy jego ładowaniu
  // (celowo: dzięki temu ostrzeżenie o fallbacku leci raz na instancję, a nie na request).
  process.env.ADMIN_EMAILS = " ops@example.test ,Boss@Example.TEST";
});

vi.mock("next-auth", () => ({
  default: () => ({ handlers: {}, auth: async () => null, signIn: async () => undefined, signOut: async () => undefined }),
}));
vi.mock("next-auth/providers/twitch", () => ({ default: (o: unknown) => o }));
vi.mock("next-auth/providers/discord", () => ({ default: (o: unknown) => o }));
vi.mock("next-auth/providers/google", () => ({ default: (o: unknown) => o }));

import { isBanActive, isPermanentAdminEmail } from "@/lib/auth";

const NOW = new Date("2026-08-09T12:00:00.000Z");

describe("isBanActive", () => {
  it("nie blokuje konta bez bana", () => {
    expect(isBanActive({ isBanned: false, bannedUntil: null }, NOW)).toBe(false);
    expect(isBanActive({}, NOW)).toBe(false);
    expect(isBanActive({ isBanned: null, bannedUntil: null }, NOW)).toBe(false);
  });

  it("blokuje ban permanentny (bannedUntil === null)", () => {
    expect(isBanActive({ isBanned: true, bannedUntil: null }, NOW)).toBe(true);
    expect(isBanActive({ isBanned: true }, NOW)).toBe(true);
  });

  it("blokuje ban czasowy, którego termin jeszcze nie minął", () => {
    expect(isBanActive({ isBanned: true, bannedUntil: new Date("2026-08-10T00:00:00.000Z") }, NOW)).toBe(true);
  });

  it("wpuszcza, gdy ban czasowy już wygasł (auto-unban — semantyka signIn callbacku)", () => {
    expect(isBanActive({ isBanned: true, bannedUntil: new Date("2026-08-08T00:00:00.000Z") }, NOW)).toBe(false);
  });

  it("dokładny moment wygaśnięcia jeszcze blokuje (granica to `< now`, nie `<= now`)", () => {
    expect(isBanActive({ isBanned: true, bannedUntil: new Date(NOW) }, NOW)).toBe(true);
  });

  it("sama data bez flagi isBanned nie blokuje — decyduje isBanned", () => {
    expect(isBanActive({ isBanned: false, bannedUntil: new Date("2026-08-10T00:00:00.000Z") }, NOW)).toBe(false);
  });
});

describe("isPermanentAdminEmail", () => {
  it("czyta ADMIN_EMAILS: trim + lowercase, po przecinku", () => {
    expect(isPermanentAdminEmail("ops@example.test")).toBe(true);
    expect(isPermanentAdminEmail("BOSS@example.test")).toBe(true);
  });

  it("ustawione ADMIN_EMAILS ZASTĘPUJE hardcoded fallback (regresja: dało się tylko dodawać)", () => {
    expect(isPermanentAdminEmail("dzierzawskii98.dam@gmail.com")).toBe(false);
  });

  it("nieznany / pusty adres nigdy nie jest adminem", () => {
    expect(isPermanentAdminEmail("random@example.test")).toBe(false);
    expect(isPermanentAdminEmail("")).toBe(false);
    expect(isPermanentAdminEmail(null)).toBe(false);
    expect(isPermanentAdminEmail(undefined)).toBe(false);
  });
});
