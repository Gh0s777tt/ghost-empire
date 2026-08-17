// src/app/overlay/scene/[id]/page.tsx
// OBS browser source: /overlay/scene/<id>?token=<OVERLAY_TOKEN>
// Renders a saved scene (#550) — several existing overlay widgets composited as
// absolutely-positioned iframes, so one browser source = a whole scene. Each child
// iframe is a real /overlay/<widget> page and validates the token itself.
import { prisma } from "@/lib/prisma";
import { parseElements, elementEnabled } from "@/lib/overlay-scenes";
import { SceneClient } from "./SceneClient";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Scene Overlay",
  robots: { index: false, follow: false },
};

export default async function SceneOverlayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Fallback jak w GET panelu: kolumna `enabled` wymaga `db push`, a kod może trafić na produkcję
  // przed migracją. Bez tego zapytanie rzucałoby, `.catch` dawał `null` i źródło w OBS pokazałoby
  // widzom „Scene not found" — czyli działająca scena zniknęłaby ze streamu. Brak kolumny =
  // scena włączona (zachowanie sprzed zmiany).
  const scene = await prisma.overlayScene
    .findUnique({ where: { id }, select: { elements: true, enabled: true } })
    .catch(() =>
      prisma.overlayScene
        .findUnique({ where: { id }, select: { elements: true } })
        .then((r) => (r ? { ...r, enabled: true } : null))
        .catch(() => null),
    );
  // Wyłączone elementy odsiewamy TU, na serwerze: źródło w OBS nie ma wtedy nawet iframe'a, więc
  // schowany widget przestaje kosztować CPU i nie łączy się po dane (update 2026-08).
  const elements = parseElements(scene?.elements).filter(elementEnabled);

  return (
    <>
      <SceneClient elements={elements} found={!!scene} enabled={scene?.enabled !== false} />
    </>
  );
}
