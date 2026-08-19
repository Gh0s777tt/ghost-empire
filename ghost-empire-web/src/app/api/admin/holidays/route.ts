// src/app/api/admin/holidays/route.ts
// Nadchodzące święta państwowe dla wskazanego kraju — zasilają kafelki „odpal event" w panelu.
//
// PO CO OSOBNA TRASA, a nie fetch z przeglądarki: kod kraju wpada do adresu URL, więc walidacja
// musi być po stronie serwera (dwie litery, nic więcej). Do tego odpowiedź jest cache'owana
// **wspólnie dla wszystkich portali** — święta danego kraju są takie same dla każdego, więc jeden
// strzał do Nager.Date na 12 h obsługuje całą platformę zamiast raz na admina.
//
// Trasa jest tylko-do-odczytu i nie dotyka bazy; bramka `requirePermission("create_events")` jest
// taka sama jak przy tworzeniu eventu, bo do tego właśnie służy ta lista.
import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin";
import { cacheJson } from "@/lib/redis";
import { createLogger } from "@/lib/logger";
import { parsujSwieta, nadchodzace, poprawnyKodKraju, urlSwiat } from "@/lib/holidays";

const log = createLogger("admin.holidays");

/** 12 h — kalendarz świąt zmienia się raz do roku, więc częstsze pytanie to czysty koszt. */
const TTL_MS = 12 * 60 * 60 * 1000;

export async function GET(req: Request) {
  const auth = await requirePermission("create_events");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const kraj = new URL(req.url).searchParams.get("kraj") ?? "";
  if (!poprawnyKodKraju(kraj)) {
    return NextResponse.json({ error: "Nieprawidłowy kod kraju (oczekiwane dwie litery)" }, { status: 400 });
  }
  const kod = kraj.toUpperCase();

  try {
    const swieta = await cacheJson(`holidays:${kod}`, TTL_MS, async () => {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 8_000);
      try {
        const r = await fetch(urlSwiat(kod), { signal: ctrl.signal, headers: { Accept: "application/json" } });
        // 404 = Nager nie zna tego kraju. To nie błąd naszej trasy, tylko pusta lista.
        if (!r.ok) return [];
        return parsujSwieta(await r.json());
      } finally {
        clearTimeout(t);
      }
    });

    return NextResponse.json({ kraj: kod, swieta: nadchodzace(swieta) });
  } catch (e) {
    // Fail-soft: panel ma pokazać zaszyte szablony nawet gdy Nager leży — brak listy świąt
    // państwowych nie może zabrać właścicielowi portalu Halloween i walentynek.
    log.error("pobranie świąt nie powiodło się", e, { kraj: kod });
    return NextResponse.json({ kraj: kod, swieta: [], niedostepne: true });
  }
}
