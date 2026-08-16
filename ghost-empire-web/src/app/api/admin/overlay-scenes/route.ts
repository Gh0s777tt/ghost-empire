// src/app/api/admin/overlay-scenes/route.ts
// CRUD for overlay scenes (#550) — saved multi-widget layouts. Tenant-scoped, admin-
// only, audited. Incoming elements are re-validated through parseElements (unknown
// widgets dropped, positions clamped, count capped) before storage. Graceful before
// the table is migrated.
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { currentTenantId } from "@/lib/tenant";
import { logAdminAction } from "@/lib/audit";
import { parseElements } from "@/lib/overlay-scenes";
import { sceneTemplate } from "@/lib/scene-templates";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const tid = await currentTenantId();
  // ⚠️ Kolejność wdrożenia: kolumna `enabled` jest addytywna i wymaga `db push`
  // (docs/MIGRACJA-2026-08.md §4), a kod trafia na Vercela przy mergu do `main` — czyli MOŻE wylądować
  // na produkcji ZANIM baza dostanie kolumnę. Bez tego fallbacku Prisma rzucałaby „column does not
  // exist", `.catch` zwracał pustą listę i panel pokazywałby ZERO scen (czyli dokładnie ten objaw,
  // od którego zaczęła się ta poprawka). Dlatego przy błędzie ponawiamy zapytanie bez `enabled`
  // i traktujemy sceny jak włączone — zachowanie sprzed zmiany. Po migracji ścieżka zapasowa
  // przestaje się odpalać i można ją usunąć.
  const where = tid ? { tenantId: tid } : {};
  const base = { id: true, name: true, elements: true, updatedAt: true } as const;
  const scenes = await prisma.overlayScene
    .findMany({ where, orderBy: { createdAt: "asc" }, select: { ...base, enabled: true } })
    .catch(() =>
      prisma.overlayScene
        .findMany({ where, orderBy: { createdAt: "asc" }, select: base })
        .then((rows) => rows.map((r) => ({ ...r, enabled: true })))
        .catch(() => []),
    );
  return NextResponse.json({ scenes });
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const tid = await currentTenantId();

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Nieprawidłowe dane" }, { status: 400 }); }
  const action = String(body.action ?? "");
  const tenantWhere = tid ? { tenantId: tid } : {};

  if (action === "create") {
    const name = String(body.name ?? "").trim().slice(0, 60) || "Scene";
    const created = await prisma.overlayScene.create({ data: { ...(tid ? { tenantId: tid } : {}), name, elements: "[]" } });
    await logAdminAction({ adminId: auth.userId, action: "update_integrations", targetType: "overlay_scene", targetId: created.id, details: { create: name }, req });
    return NextResponse.json({ ok: true, scene: { id: created.id, name: created.name, elements: created.elements, enabled: created.enabled ?? true } });
  }

  // One-click curated template (#771): create a scene pre-filled with the template's
  // layout. Elements pass through parseElements like any client payload (defense in depth).
  if (action === "apply_template") {
    const tpl = sceneTemplate(body.templateId);
    if (!tpl) return NextResponse.json({ error: "Nieznany szablon" }, { status: 400 });
    const name = String(body.name ?? "").trim().slice(0, 60) || tpl.id;
    const elements = JSON.stringify(parseElements(JSON.stringify(tpl.elements)));
    const created = await prisma.overlayScene.create({ data: { ...(tid ? { tenantId: tid } : {}), name, elements } });
    await logAdminAction({ adminId: auth.userId, action: "update_integrations", targetType: "overlay_scene", targetId: created.id, details: { template: tpl.id }, req });
    return NextResponse.json({ ok: true, scene: { id: created.id, name: created.name, elements: created.elements, enabled: created.enabled ?? true } });
  }

  // Duplikat istniejącej sceny (update 2026-08). Streamerzy budują warianty tego samego układu
  // („to samo, ale bez czatu — na przerwę"), a bez tego jedyną drogą było ręczne rozstawianie od zera.
  // Elementy przechodzą przez `parseElements` jak każdy inny zapis (defense in depth), a duplikat
  // NIE dziedziczy `enabled` — nowa scena startuje włączona, żeby nie powstał ukryty klon,
  // którego nie widać ani w OBS, ani w oczywisty sposób w panelu.
  if (action === "duplicate") {
    const id = String(body.id ?? "");
    const src = await prisma.overlayScene
      .findFirst({ where: { id, ...tenantWhere }, select: { name: true, elements: true } })
      .catch(() => null);
    if (!src) return NextResponse.json({ error: "Nie znaleziono" }, { status: 404 });
    const name = String(body.name ?? `${src.name} (kopia)`).trim().slice(0, 60) || "Scene";
    const elements = JSON.stringify(parseElements(src.elements));
    const created = await prisma.overlayScene.create({ data: { ...(tid ? { tenantId: tid } : {}), name, elements } });
    await logAdminAction({ adminId: auth.userId, action: "update_integrations", targetType: "overlay_scene", targetId: created.id, details: { duplicateOf: id }, req });
    return NextResponse.json({ ok: true, scene: { id: created.id, name: created.name, elements: created.elements, enabled: created.enabled ?? true } });
  }

  if (action === "update") {
    const id = String(body.id ?? "");
    const data: Record<string, unknown> = {};
    if (typeof body.name === "string") data.name = body.name.trim().slice(0, 60) || "Scene";
    // Wyłączenie/włączenie całej sceny (update 2026-08) — osobne od `elements`, żeby przełącznik
    // nie wymagał wysyłania całego układu.
    if (typeof body.enabled === "boolean") data.enabled = body.enabled;
    if (body.elements !== undefined) {
      // Re-validate: clamp positions, drop unknown widgets, cap count.
      data.elements = JSON.stringify(parseElements(JSON.stringify(body.elements)));
    }
    // Przed migracją (patrz komentarz w GET) zapis `enabled` wywaliłby CAŁY update — razem z
    // układem sceny, który z kolumną nie ma nic wspólnego. Dlatego przy błędzie ponawiamy bez tego
    // pola i mówimy wprost, czego brakuje, zamiast zwracać gołe 500.
    let r = await prisma.overlayScene.updateMany({ where: { id, ...tenantWhere }, data }).catch(() => null);
    if (r === null && "enabled" in data) {
      const { enabled: _pominiete, ...bezFlagi } = data;
      if (Object.keys(bezFlagi).length === 0) {
        return NextResponse.json({ error: "Włącz/wyłącz sceny wymaga migracji bazy (db push)" }, { status: 503 });
      }
      r = await prisma.overlayScene.updateMany({ where: { id, ...tenantWhere }, data: bezFlagi }).catch(() => null);
    }
    if (r === null) return NextResponse.json({ error: "Zapis nie powiódł się" }, { status: 500 });
    if (r.count === 0) return NextResponse.json({ error: "Nie znaleziono" }, { status: 404 });
    return NextResponse.json({ ok: true });
  }

  if (action === "delete") {
    const id = String(body.id ?? "");
    await prisma.overlayScene.deleteMany({ where: { id, ...tenantWhere } }).catch(() => {});
    await logAdminAction({ adminId: auth.userId, action: "update_integrations", targetType: "overlay_scene", targetId: id, req });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Nieznana akcja" }, { status: 400 });
}
