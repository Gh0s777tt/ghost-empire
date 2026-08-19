// src/app/api/cron/fx-rates/route.ts
// Vercel Cron — raz dziennie pobiera tabelę A z NBP i odkłada ją do cache'u, z którego
// `plnFromMinor` liczy wielkość grantu waluty portalu za realną wpłatę.
//
// Zadanie jest CELOWO nieszkodliwe przy porażce: NBP nie odpowiedział → logujemy i wychodzimy
// z `ok: true`, bo produkt jedzie dalej na ostatnim znanym kursie (patrz `fx-store.ts`).
// Zwrócenie 5xx nic by nie naprawiło, a zaśmieciłoby alerty przy każdym weekendzie.
//
// Vercel sam dokłada `Authorization: Bearer ${CRON_SECRET}` przy wywołaniu z crona.
import { NextResponse } from "next/server";
import { createLogger } from "@/lib/logger";
import { verifyCronSecret } from "@/lib/utils";
import { pobierzKursyNbp } from "@/lib/donations/nbp";
import { maSwiezeKursy, zapiszKursy, odczytajKursy } from "@/lib/donations/fx-store";

const log = createLogger("cron.fx-rates");

export async function GET(req: Request) {
  if (!verifyCronSecret(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // NBP publikuje w dni robocze — drugi przebieg tego samego dnia nie ma czego pobrać.
  if (await maSwiezeKursy()) {
    return NextResponse.json({ ok: true, pominieto: "kurs z dziś już w cache'u" });
  }

  const wynik = await pobierzKursyNbp();
  if (!wynik) {
    // Weekend, święto albo awaria NBP — wszystkie trzy wyglądają tak samo i wszystkie są OK.
    const poprzedni = await odczytajKursy();
    log.warn("NBP bez nowej tabeli — zostaje ostatni znany kurs", {
      ostatniaTabela: poprzedni?.tabela ?? null,
      ostatniaData: poprzedni?.data ?? null,
    });
    return NextResponse.json({ ok: true, pobrano: false, ostatniaTabela: poprzedni?.tabela ?? null });
  }

  await zapiszKursy(wynik);
  log.info("kursy NBP odświeżone", {
    tabela: wynik.tabela,
    data: wynik.data,
    walut: Object.keys(wynik.kursy).length,
  });
  return NextResponse.json({
    ok: true,
    pobrano: true,
    tabela: wynik.tabela,
    data: wynik.data,
    walut: Object.keys(wynik.kursy).length,
  });
}
