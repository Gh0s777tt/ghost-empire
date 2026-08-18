// src/app/api/overlay/live/route.ts
// Źródło danych dla stałego adresu OBS `/overlay/live?token=<OVERLAY_TOKEN>` (update 2026-08).
//
// Po co istnieje: do tej pory KAŻDA scena miała własny adres `/overlay/scene/<id>`, więc zmiana
// sceny znaczyła podmianę źródła w OBS — czynność, której nikt nie wykona w trakcie transmisji.
// Ten endpoint zwraca scenę oznaczoną jako AKTYWNA dla portalu z nagłówka Host, a strona `/overlay/live`
// odpytuje go cyklicznie. Efekt: jeden adres wklejony do OBS raz na zawsze, a przełączanie odbywa się
// w panelu albo na Stream Decku.
//
// Auth: ten sam `overlayToken` co pozostałe nakładki (`isValidOverlayToken`) — endpoint wystawia
// UKŁAD sceny, nie dane osobowe, ale i tak jest za tokenem, żeby nie dało się zdalnie sprawdzać,
// co dany streamer ma teraz na ekranie. Portal WYŁĄCZNIE z nagłówka Host, nigdy z body/query —
// inaczej dałoby się podejrzeć cudzy portal, podając jego id.
//
// `/api/*` jest poza `proxy.ts`, więc trasa robi własną bramkę (konwencja repo).
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentTenantId } from "@/lib/tenant";
import { isValidOverlayToken } from "@/lib/alerts";
import { parseElements, elementEnabled } from "@/lib/overlay-scenes";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token");
  const tid = await currentTenantId();
  if (!(await isValidOverlayToken(token, tid))) {
    return NextResponse.json({ error: "Nieprawidłowy token" }, { status: 401 });
  }

  const where = tid ? { tenantId: tid } : {};
  // Fallback na brak kolumny `isActive`: kod może trafić na produkcję przed `db push`
  // (docs/MIGRACJA-2026-08.md §5). Wtedy po prostu nie ma aktywnej sceny — strona pokaże
  // instrukcję zamiast się wywalić, a pozostałe adresy `/overlay/scene/<id>` działają jak dotąd.
  const scene = await prisma.overlayScene
    .findFirst({ where: { ...where, isActive: true }, select: { id: true, name: true, elements: true, enabled: true } })
    .catch(() => null);

  if (!scene) return NextResponse.json({ scene: null });
  // Wyłączona scena = pusty ekran, dokładnie jak na `/overlay/scene/<id>`; wyłączone elementy
  // odsiewamy serwerowo, żeby schowany widget nie kosztował CPU w źródle OBS.
  const elements = scene.enabled === false ? [] : parseElements(scene.elements).filter(elementEnabled);
  return NextResponse.json({ scene: { id: scene.id, name: scene.name, enabled: scene.enabled !== false }, elements });
}
