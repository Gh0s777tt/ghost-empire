// src/app/api/admin/tenant-copy/route.ts
// Nadpisania treści portalu (update 2026-08) — odczyt i zapis z panelu.
//
// Po co istnieje: `welcome` pochodził wyłącznie ze wspólnych katalogów i18n, więc każdy portal
// wyglądał inaczej, ale MÓWIŁ to samo. Ta trasa pozwala streamerowi opisać własną społeczność
// swoimi słowami — w granicach ZAMKNIĘTEJ listy pól (`lib/tenant-copy`).
//
// Bramki: admin + tenant z Hosta (nigdy z body). Klucze spoza allowlisty są odrzucane, więc tabela
// nie stanie się workiem na dowolne dane, a pola prawne (`terms`/`privacy`) są poza zasięgiem panelu
// z założenia — regulamin podlega polskiemu prawu i przeglądowi prawnika (CLAUDE.md).
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { currentTenantId } from "@/lib/tenant";
import { logAdminAction } from "@/lib/audit";
import { EDITABLE_COPY, walidujCopy } from "@/lib/tenant-copy";

export const dynamic = "force-dynamic";

/** Locale obsługiwane przez portal — ten sam zestaw co katalogi `src/messages/*.json`. */
const LOCALES = ["pl", "en", "de", "es", "fr", "id", "it", "ja", "ko", "pt", "ru", "uk", "zh", "ar"];

export async function GET(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const tid = await currentTenantId();
  const locale = new URL(req.url).searchParams.get("locale") ?? "pl";
  if (!LOCALES.includes(locale)) return NextResponse.json({ error: "Nieznany język" }, { status: 400 });

  // Fail-soft na brak tabeli (migracja nie poszła — MIGRACJA-2026-08.md §7): panel pokaże puste
  // nadpisania i teksty domyślne, zamiast wywalić całą sekcję.
  const rows = await prisma.tenantCopy
    .findMany({ where: { tenantId: tid ?? null, locale }, select: { key: true, value: true } })
    .catch(() => []);

  return NextResponse.json({
    locale,
    fields: EDITABLE_COPY.map((f) => ({ ...f, value: rows.find((r) => r.key === f.key)?.value ?? "" })),
  });
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const tid = await currentTenantId();

  let body: { locale?: unknown; values?: unknown };
  try { body = (await req.json()) as typeof body; } catch {
    return NextResponse.json({ error: "Nieprawidłowe dane" }, { status: 400 });
  }
  const locale = typeof body.locale === "string" ? body.locale : "";
  if (!LOCALES.includes(locale)) return NextResponse.json({ error: "Nieznany język" }, { status: 400 });
  if (!body.values || typeof body.values !== "object") {
    return NextResponse.json({ error: "Brak treści" }, { status: 400 });
  }

  // Walidujemy WSZYSTKO przed pierwszym zapisem: częściowo zapisany formularz jest gorszy niż
  // odrzucony w całości — streamer nie wiedziałby, które pola weszły.
  const zapisy: { key: string; value: string | null }[] = [];
  for (const [key, raw] of Object.entries(body.values as Record<string, unknown>)) {
    if (typeof raw !== "string") continue;
    const w = walidujCopy(key, raw);
    if (!w.ok) {
      return NextResponse.json(
        { error: w.powod === "za-dlugie" ? `Pole ${key} jest za długie` : `Nieznane pole ${key}` },
        { status: 400 },
      );
    }
    zapisy.push({ key, value: w.value });
  }

  // Świadomie BEZ `upsert` po złożonym unique. Dwa powody, oba realne:
  // (1) `tenantId` jest nullable, a Prisma wymaga w `where` unique wartości NIE-null, więc portal
  //     bezhostowy (`tenantId: null`, wdrożenie jednoportalowe) w ogóle nie dałby się zapisać;
  // (2) w Postgresie `NULL` w indeksie unikalnym jest traktowany jako wartość ODRĘBNA, więc
  //     `@@unique([tenantId, locale, key])` i tak nie chroniłby przed duplikatem dla `tenantId = NULL`.
  // `updateMany` + warunkowy `create` działa poprawnie w OBU przypadkach; całość idzie w transakcji,
  // więc formularz zapisuje się w komplecie albo wcale.
  const ok = await prisma
    .$transaction(async (tx) => {
      for (const z of zapisy) {
        const gdzie = { tenantId: tid ?? null, locale, key: z.key };
        if (z.value === null) {
          // Puste = skasuj nadpisanie i wróć do tłumaczenia domyślnego. `deleteMany` (nie `delete`),
          // bo wiersza może nie być, a to nie jest błąd.
          await tx.tenantCopy.deleteMany({ where: gdzie });
          continue;
        }
        const r = await tx.tenantCopy.updateMany({ where: gdzie, data: { value: z.value } });
        if (r.count === 0) await tx.tenantCopy.create({ data: { ...gdzie, value: z.value } });
      }
      return true;
    })
    .catch(() => false);

  if (!ok) return NextResponse.json({ error: "Własna treść wymaga migracji bazy (db push)" }, { status: 503 });

  await logAdminAction({ adminId: auth.userId, action: "update_integrations", targetType: "tenant_copy", targetId: locale, details: { pola: zapisy.length }, req });
  return NextResponse.json({ ok: true, zapisano: zapisy.length });
}
