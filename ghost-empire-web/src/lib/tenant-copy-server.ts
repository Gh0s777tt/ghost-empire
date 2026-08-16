// src/lib/tenant-copy-server.ts
// Odczyt nadpisań treści portalu (update 2026-08) — serwerowa połowa `lib/tenant-copy`.
//
// Wydzielone z czystego modułu celowo: `tenant-copy.ts` ma zostać testowalny bez bazy (konwencja
// repo: `src/lib/*` unit-testowane bez mocków DB/sieci), a wszystko, co dotyka Prismy i cache'a,
// mieszka tutaj.
import { prisma } from "@/lib/prisma";
import { currentTenantId } from "@/lib/tenant";

/**
 * Nadpisania treści dla BIEŻĄCEGO portalu i podanego locale, jako mapa `klucz → wartość`.
 *
 * @remarks
 * Zwraca pustą mapę, gdy portal niczego nie nadpisał **albo** gdy tabeli jeszcze nie ma
 * (migracja `db push` nie poszła — patrz `docs/MIGRACJA-2026-08.md` §7). To celowy fail-soft:
 * strona powitalna ma się wyrenderować z tekstami domyślnymi, a nie zwrócić 500, bo wdrożenie
 * kodu wyprzedziło migrację. Ta sama zasada, co przy `OverlayScene.enabled`/`isActive`.
 */
export async function getTenantCopy(locale: string): Promise<Map<string, string>> {
  const tid = await currentTenantId();
  const rows = await prisma.tenantCopy
    .findMany({
      where: { ...(tid ? { tenantId: tid } : { tenantId: null }), locale },
      select: { key: true, value: true },
    })
    .catch(() => []);
  return new Map(rows.map((r) => [r.key, r.value]));
}
