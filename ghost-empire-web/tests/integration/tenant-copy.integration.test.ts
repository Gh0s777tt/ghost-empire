// Pokrycie DB-owe ODCZYTU nadpisań treści portalu (`lib/tenant-copy-server`).
//
// Po co osobny plik: unit testy `lib/tenant-copy` pokrywają czystą logikę — allowlistę kluczy,
// walidację i `resolveCopy` — czyli ZAPIS i wybór wartości. Nie dotykają natomiast tego, co
// funkcja realnie oddaje ze świeżo odczytanego wiersza. Dokładnie tam siedział defekt: panel
// obiecuje użytkownikowi „Możesz używać znaczników %tokenName% i %brandShort%", a `getTenantCopy`
// zwracał wiersz surowy, więc strona powitalna renderowała literalne `%tokenName%`. Typy tego nie
// widziały (marker to zwykły string), a testy walidacji sprawdzały jedynie, że marker NIE ZOSTAJE
// USUNIĘTY przy zapisie — co jest prawdą i po defekcie, i po naprawie.
//
// Mockowana jest WYŁĄCZNIE granica rozstrzygania tenanta (`@/lib/tenant`), bo poza kontekstem
// requestu nie da się jej wywołać — ten sam zabieg co w shop-chips.integration. Zapis i odczyt
// idą do prawdziwego Postgresa.
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { prisma } from "@/lib/prisma";

const TENANT = { id: null as string | null, tokenName: "Duszki", tokenSymbol: "DSZ", name: "Portal Testowy", shortName: "PT", ownerHandle: "@ktos" };

vi.mock("@/lib/tenant", () => ({
  currentTenantId: async () => TENANT.id,
  getCurrentTenant: async () => TENANT,
}));

// import PO mocku — moduł czyta granicę w czasie wywołania, ale trzymamy konwencję pliku obok
const { getTenantCopy } = await import("@/lib/tenant-copy-server");

beforeEach(async () => {
  await prisma.tenantCopy.deleteMany({});
});
afterAll(async () => {
  await prisma.tenantCopy.deleteMany({});
});

async function wstaw(key: string, value: string, locale = "pl") {
  await prisma.tenantCopy.create({
    data: { tenantId: TENANT.id, locale, key, value, updatedAt: new Date() },
  });
}

describe("getTenantCopy — odczyt nadpisań treści (integration, prawdziwa baza)", () => {
  it("ROZWIJA markery marki — to jest sedno defektu", async () => {
    await wstaw("heroSubtitle", "Zbieraj %tokenName% i wymieniaj na nagrody");
    const mapa = await getTenantCopy("pl");
    expect(mapa.get("heroSubtitle")).toBe("Zbieraj Duszki i wymieniaj na nagrody");
    expect(mapa.get("heroSubtitle")).not.toContain("%tokenName%");
  });

  it("rozwija PEŁNY zestaw markerów, jaki zna `applyTokenBranding`", async () => {
    // Zestaw jest zamknięty: %tokenName%, %gt% (symbol), %brandName%, %brandShort%, %owner%.
    // Markera `%tokenSymbol%` NIE MA — symbol waluty to `%gt%`. Podpowiedź w panelu obiecuje
    // tylko `%tokenName%` i `%brandShort%`, więc po tej poprawce mówi prawdę.
    await wstaw("heroTitle", "%brandShort% · %gt% · %brandName% · %owner% · %tokenName%");
    const mapa = await getTenantCopy("pl");
    expect(mapa.get("heroTitle")).toBe("PT · DSZ · Portal Testowy · @ktos · Duszki");
  });

  it("nieznany marker zostaje nietknięty (nie zjadamy tekstu użytkownika)", async () => {
    await wstaw("heroTitle", "Cena: %tokenSymbol% 100");
    const mapa = await getTenantCopy("pl");
    expect(mapa.get("heroTitle")).toBe("Cena: %tokenSymbol% 100");
  });

  it("w bazie zostaje MARKER, nie rozwinięta wartość", async () => {
    // Inwariant „tekst, który persystuje, trzyma marker": dzięki temu zmiana nazwy waluty
    // naprawia też teksty zapisane wcześniej, zamiast zostawiać w nich starą nazwę.
    await wstaw("heroSubtitle", "Zbieraj %tokenName%");
    await getTenantCopy("pl");
    const wiersz = await prisma.tenantCopy.findFirst({ where: { key: "heroSubtitle" } });
    expect(wiersz?.value).toBe("Zbieraj %tokenName%");
  });

  it("tekst bez markera przechodzi bez zmian", async () => {
    await wstaw("heroTitle", "Zwykły tytuł bez znaczników");
    const mapa = await getTenantCopy("pl");
    expect(mapa.get("heroTitle")).toBe("Zwykły tytuł bez znaczników");
  });

  it("oddaje wyłącznie żądane locale", async () => {
    await wstaw("heroTitle", "Polski", "pl");
    await wstaw("heroTitle", "English", "en");
    expect((await getTenantCopy("pl")).get("heroTitle")).toBe("Polski");
    expect((await getTenantCopy("en")).get("heroTitle")).toBe("English");
  });

  it("brak nadpisań = pusta mapa (strona renderuje teksty domyślne)", async () => {
    expect((await getTenantCopy("pl")).size).toBe(0);
  });
});
