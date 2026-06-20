// src/lib/overlay-scenes.ts
// Overlay SCENE builder (#550) — a scene is a saved layout of several existing overlay
// widgets, each positioned on a 16:9 canvas (percentages). The render page composites
// them as iframes of the real /overlay/<widget> pages, so nothing about the existing
// overlays has to change. Pure source-of-truth for the catalog + validation, shared by
// the editor, the API and the render page.

export type SceneWidget = { id: string; path: string; query?: string; w: number; h: number };

// Curated to widgets that compose well in a scene (full-screen alerts excluded). w/h are
// sensible DEFAULT sizes as % of the 1920×1080 canvas.
export const SCENE_WIDGETS: SceneWidget[] = [
  { id: "chat", path: "/overlay/chat", w: 28, h: 60 },
  { id: "goals", path: "/overlay/goals", w: 26, h: 37 },
  { id: "subathon", path: "/overlay/subathon", w: 31, h: 19 },
  { id: "predictions", path: "/overlay/predictions", w: 26, h: 37 },
  { id: "polls", path: "/overlay/polls", w: 26, h: 37 },
  { id: "viewers", path: "/overlay/viewers", w: 11, h: 7 },
  { id: "emoji-combo", path: "/overlay/emoji-combo", w: 21, h: 24 },
  { id: "wheel", path: "/overlay/wheel", w: 21, h: 41 },
  { id: "rumble", path: "/overlay/rumble", w: 19, h: 11 },
  { id: "companion", path: "/overlay/companion", w: 19, h: 13 },
  { id: "clan", path: "/overlay/clan", w: 19, h: 13 },
  { id: "clan-war", path: "/overlay/clan-war", w: 20, h: 24 },
  { id: "support-qr", path: "/overlay/support-qr", w: 16, h: 33 },
  { id: "support-goal", path: "/overlay/support-goal", w: 19, h: 16 },
  { id: "top-supporters", path: "/overlay/top-supporters", w: 18, h: 30 },
  { id: "trivia", path: "/overlay/trivia", w: 23, h: 30 },
  { id: "last-sub", path: "/overlay/last-event", query: "kind=sub", w: 18, h: 8 },
  { id: "last-donator", path: "/overlay/last-event", query: "kind=donation", w: 18, h: 8 },
  { id: "last-follower", path: "/overlay/last-event", query: "kind=follow", w: 18, h: 8 },
];

const BY_ID = new Map(SCENE_WIDGETS.map((w) => [w.id, w]));

export function sceneWidget(id: string): SceneWidget | null {
  return BY_ID.get(id) ?? null;
}

export type SceneElement = { id: string; widget: string; x: number; y: number; w: number; h: number };

export const MAX_ELEMENTS = 24;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Clamp an element to the canvas: size 4..100%, position kept fully on-canvas. */
export function clampElement(el: SceneElement): SceneElement {
  const w = clamp(Math.round(el.w), 4, 100);
  const h = clamp(Math.round(el.h), 4, 100);
  return {
    id: el.id,
    widget: el.widget,
    w,
    h,
    x: clamp(Math.round(el.x), 0, 100 - w),
    y: clamp(Math.round(el.y), 0, 100 - h),
  };
}

/** Safe-parse stored elements JSON → validated array (drops unknown widgets, clamps, caps count). */
export function parseElements(json: string | null | undefined): SceneElement[] {
  if (!json) return [];
  let arr: unknown;
  try { arr = JSON.parse(json); } catch { return []; }
  if (!Array.isArray(arr)) return [];
  const out: SceneElement[] = [];
  for (const raw of arr.slice(0, MAX_ELEMENTS)) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const widget = String(r.widget ?? "");
    const def = BY_ID.get(widget);
    if (!def) continue; // unknown / removed widget
    out.push(
      clampElement({
        id: String(r.id ?? `${widget}-${out.length}`),
        widget,
        x: Number(r.x) || 0,
        y: Number(r.y) || 0,
        w: Number(r.w) || def.w,
        h: Number(r.h) || def.h,
      }),
    );
  }
  return out;
}
