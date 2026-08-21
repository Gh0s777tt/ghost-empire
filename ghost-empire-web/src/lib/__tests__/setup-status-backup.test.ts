// Kopia zapasowa w liście kontrolnej — najgroźniejszy z niewidocznych braków.
//
// Tło: cron `api/cron/backup` jest DOMYŚLNIE UŚPIONY — bez `BACKUP_S3_*` zwraca
// `{ ok: true, skipped: true }` i HTTP 200. Cron świecił więc na zielono, panel nie miał ani
// jednej pozycji o kopii, a właściciel portalu dowiedziałby się, że kopii off-site nie ma,
// dopiero przy próbie odtworzenia. Znalezione po awarii, w której produkcja leżała całą dobę,
// a KAŻDY sygnał pokazywał „wszystko w porządku".
//
// Ten test pilnuje, żeby krok nie zniknął z listy i nie zmienił się w wymagany (blokowanie
// kreatora startowego na konfiguracji wdrożeniowej byłoby gorsze niż cisza, którą naprawiamy).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { SETUP_STEPS, computeSetupProgress } from "@/lib/setup-status";

const LOCALE = ["pl", "en", "de", "es", "fr", "id", "it", "ja", "ko", "pt", "ru", "uk", "zh", "ar"];

const krok = () => SETUP_STEPS.find((s) => s.key === "backup");

describe("krok `backup` w liście kontrolnej", () => {
  it("istnieje — bez niego uśpiona kopia jest niewidoczna", () => {
    expect(krok()).toBeDefined();
  });

  it("jest OPCJONALNY — nie może blokować startu portalu", () => {
    // `BACKUP_S3_*` to konfiguracja WDROŻENIA, nie portalu: streamer na współdzielonej instancji
    // nie ma jak jej ustawić, więc wymaganie jej zablokowałoby mu kreator na zawsze.
    expect(krok()?.optional).toBe(true);
  });

  it("nie liczy się do kroków wymaganych", () => {
    const bez = computeSetupProgress({ backup: false });
    const z = computeSetupProgress({ backup: true });
    expect(bez.requiredTotal).toBe(z.requiredTotal);
    expect(bez.allRequiredDone).toBe(z.allRequiredDone);
  });

  it("odznaczenie kroku zmienia postęp OGÓLNY (inaczej pozycja byłaby dekoracją)", () => {
    const bez = computeSetupProgress({ backup: false });
    const z = computeSetupProgress({ backup: true });
    expect(z.doneAll).toBe(bez.doneAll + 1);
  });

  it("kieruje do sekcji, w której da się to ustawić", () => {
    expect(krok()?.section).toBe("integrations");
  });

  it("ma etykietę i podpowiedź we WSZYSTKICH 14 locale", () => {
    for (const loc of LOCALE) {
      const kat = JSON.parse(readFileSync(resolve(process.cwd(), `src/messages/${loc}.json`), "utf8"));
      const poz = kat.admin?.setupStatus?.item?.backup;
      expect(poz?.label, `${loc}: brak label`).toBeTruthy();
      expect(poz?.hint, `${loc}: brak hint`).toBeTruthy();
    }
  });

  // Podpowiedź ma mówić, CO JEST NIE TAK, a nie tylko „skonfiguruj to". Sedno defektu było w tym,
  // że cron raportował sukces — i to musi paść wprost, inaczej nikt nie zrozumie powagi.
  it("podpowiedź PL/EN wymienia zmienną i ostrzega, że cron mimo to raportuje sukces", () => {
    for (const loc of ["pl", "en"]) {
      const kat = JSON.parse(readFileSync(resolve(process.cwd(), `src/messages/${loc}.json`), "utf8"));
      const hint: string = kat.admin.setupStatus.item.backup.hint;
      expect(hint, `${loc}`).toContain("BACKUP_S3_");
      expect(hint.toLowerCase(), `${loc}`).toMatch(/cron/);
    }
  });
});
