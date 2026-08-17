// src/lib/tenant-copy-server.ts
// Odczyt nadpisań treści portalu (update 2026-08) — serwerowa połowa `lib/tenant-copy`.
//
// Wydzielone z czystego modułu celowo: `tenant-copy.ts` ma zostać testowalny bez bazy (konwencja
// repo: `src/lib/*` unit-testowane bez mocków DB/sieci), a wszystko, co dotyka Prismy i cache'a,
// mieszka tutaj.
import { prisma } from "@/lib/prisma";
import { currentTenantId, getCurrentTenant } from "@/lib/tenant";
import { applyTokenBranding } from "@/lib/i18n-branding";

/**
 * Nadpisania treści dla BIEŻĄCEGO portalu i podanego locale, jako mapa `klucz → wartość`,
 * z **rozwiniętymi markerami marki** (`%tokenName%`, `%brandShort%`, …).
 *
 * @remarks
 * Zwraca pustą mapę, gdy portal niczego nie nadpisał **albo** gdy tabeli jeszcze nie ma
 * (migracja `db push` nie poszła — patrz `docs/MIGRACJA-2026-08.md` §7). To celowy fail-soft:
 * strona powitalna ma się wyrenderować z tekstami domyślnymi, a nie zwrócić 500, bo wdrożenie
 * kodu wyprzedziło migrację. Ta sama zasada, co przy `OverlayScene.enabled`/`isActive`.
 *
 * ⚠️ **Markery rozwijamy TUTAJ, przy odczycie** — nie przy zapisie. To wynika wprost z zasady
 * „tekst, który PERSYSTUJE, trzyma marker": w bazie ma zostać `%tokenName%`, żeby zmiana nazwy
 * waluty naprawiła też teksty zapisane wcześniej, a jeden portal nigdy nie pokazał waluty
 * drugiego. Bez tego kroku panel obiecywał funkcję, której nie było: podpowiedź mówi
 * „Możesz używać znaczników %tokenName%…", a strona powitalna renderowała literalne
 * `%tokenName%`. Ten sam wzorzec co `GET /api/notifications` na wierszach `Notification`.
 */
export async function getTenantCopy(locale: string): Promise<Map<string, string>> {
  const [tid, tenant] = await Promise.all([currentTenantId(), getCurrentTenant()]);
  const rows = await prisma.tenantCopy
    .findMany({
      where: { ...(tid ? { tenantId: tid } : { tenantId: null }), locale },
      select: { key: true, value: true },
    })
    .catch(() => []);
  if (rows.length === 0) return new Map();

  // Tani: `applyTokenBranding` zwraca string bez zmian, gdy nie ma w nim "%".
  const branding = {
    tokenName: tenant.tokenName,
    tokenSymbol: tenant.tokenSymbol,
    brandName: tenant.name,
    brandShort: tenant.shortName,
    owner: tenant.ownerHandle,
  };
  return new Map(rows.map((r) => [r.key, applyTokenBranding(r.value, branding)]));
}
