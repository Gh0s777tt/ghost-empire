// Pokrycie kopii zapasowej przez schemę — test istnieje po to, żeby kopia NIE mogła znów odjechać
// po cichu.
//
// Tło: `buildBackup` obejmowało 24 ze 111 modeli i nic tego nie pilnowało. Kolejne funkcje dokładały
// tabele, o których kopia nie wiedziała, więc restore gubił `Tenant` (nazwa portalu, waluta, kolory,
// logo, socjale), `TenantCopy`, sceny overlaya i reguły OBS/Govee/Hue — całą tożsamość white-label.
// Żadna bramka tego nie widziała, bo brak modelu w kopii to nie błąd typów ani nie failujący test.
//
// Test czyta `schema.prisma` jako źródło prawdy i wymaga, żeby KAŻDY model był przypisany dokładnie
// raz: albo do `MODELE_W_KOPII`, albo do `MODELE_POZA_KOPIA` z powodem. Dzięki temu dołożenie modelu
// wymusza świadomą decyzję („czy restore ma to odtworzyć?") zamiast cichego zniknięcia.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { MODELE_W_KOPII, MODELE_POZA_KOPIA } from "@/lib/backup";

const SCHEMA = readFileSync(resolve(process.cwd(), "prisma/schema.prisma"), "utf8");
const MODELE_SCHEMY = [...SCHEMA.matchAll(/^model\s+(\w+)\s*\{/gm)].map((m) => m[1]);

describe("kopia zapasowa — pokrycie modeli schemy", () => {
  it("schema.prisma faktycznie się sparsowała (inaczej reszta testów jest pusta)", () => {
    expect(MODELE_SCHEMY.length).toBeGreaterThan(100);
  });

  it("każdy model schemy jest przypisany — w kopii albo świadomie poza nią", () => {
    const przypisane = new Set([...MODELE_W_KOPII, ...Object.keys(MODELE_POZA_KOPIA)]);
    const nieprzypisane = MODELE_SCHEMY.filter((m) => !przypisane.has(m));
    expect(
      nieprzypisane,
      `Nowe modele bez decyzji o kopii: ${nieprzypisane.join(", ")}. ` +
        "Dopisz je do MODELE_W_KOPII (i do zapytania w buildBackup) albo do MODELE_POZA_KOPIA z powodem.",
    ).toEqual([]);
  });

  it("żaden model nie jest jednocześnie w kopii i poza nią", () => {
    const w = new Set(MODELE_W_KOPII);
    expect(Object.keys(MODELE_POZA_KOPIA).filter((m) => w.has(m))).toEqual([]);
  });

  it("obie listy wymieniają wyłącznie modele, które istnieją w schemie", () => {
    const istnieje = new Set(MODELE_SCHEMY);
    const widma = [...MODELE_W_KOPII, ...Object.keys(MODELE_POZA_KOPIA)].filter((m) => !istnieje.has(m));
    expect(widma, `Modele-widma (usunięte ze schemy?): ${widma.join(", ")}`).toEqual([]);
  });

  it("każde wykluczenie niesie POWÓD, nie pusty string", () => {
    const bez = Object.entries(MODELE_POZA_KOPIA).filter(([, p]) => p.trim().length < 10);
    expect(bez.map(([m]) => m)).toEqual([]);
  });

  // Konkretne modele, przez które ten defekt w ogóle bolał — wymienione z nazwy, bo to one
  // decydują o tym, czy odtworzony portal wygląda jak swój, czy jak pusty szablon.
  it("tożsamość white-label JEST w kopii", () => {
    for (const m of ["Tenant", "TenantCopy", "OverlayScene", "HueRule", "GoveeRule", "ObsRule"]) {
      expect(MODELE_W_KOPII, `${m} musi być w kopii`).toContain(m);
    }
  });

  it("magazyny poświadczeń i PII NIE są w kopii", () => {
    for (const m of [
      "Account", "Session", "Connection", "IntegrationConfig", "GameLibraryConfig",
      "TwitchStreamerToken", "KickStreamerToken", "YouTubeStreamerToken", "StreamlabsConnection",
      "DonationIntegration", "PushSubscription", "OutgoingWebhook",
      "ShippingProfile", "Donation",
    ]) {
      expect(MODELE_W_KOPII, `${m} nie może trafić do kopii`).not.toContain(m);
      expect(Object.keys(MODELE_POZA_KOPIA)).toContain(m);
    }
  });
});
