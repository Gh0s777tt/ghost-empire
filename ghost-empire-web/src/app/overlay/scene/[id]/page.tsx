// src/app/overlay/scene/[id]/page.tsx
// OBS browser source: /overlay/scene/<id>?token=<OVERLAY_TOKEN>
// Renders a saved scene (#550) — several existing overlay widgets composited as
// absolutely-positioned iframes, so one browser source = a whole scene. Each child
// iframe is a real /overlay/<widget> page and validates the token itself.
import { prisma } from "@/lib/prisma";
import { parseElements } from "@/lib/overlay-scenes";
import { SceneClient } from "./SceneClient";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Scene Overlay",
  robots: { index: false, follow: false },
};

export default async function SceneOverlayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const scene = await prisma.overlayScene.findUnique({ where: { id }, select: { elements: true } }).catch(() => null);
  const elements = parseElements(scene?.elements);

  return (
    <>
      <style>{`
        html, body { background: transparent !important; }
        body footer { display: none !important; }
        body { min-height: 0 !important; }
      `}</style>
      <SceneClient elements={elements} found={!!scene} />
    </>
  );
}
