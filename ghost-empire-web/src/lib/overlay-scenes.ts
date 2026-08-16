// src/lib/overlay-scenes.ts
// Overlay SCENE builder (#550) — a scene is a saved layout of several existing overlay
// widgets, each positioned on a 16:9 canvas (percentages). The render page composites
// them as iframes of the real /overlay/<widget> pages, so nothing about the existing
// overlays has to change. Pure source-of-truth for the catalog + validation, shared by
// the editor, the API and the render page.
import { safeMediaUrl } from "@/lib/url-safe";

export type SceneWidget = { id: string; path: string; query?: string; w: number; h: number };

/** Element „image" (update 2026-08): własna grafika streamera (upload/URL) jako element sceny —
 *  daje SCENY STATYCZNE. Renderowana jako <img>, NIE iframe widgetu; `src` przechodzi przez
 *  safeMediaUrl (http(s), bez breakoutu). To jedyny widget spoza SCENE_WIDGETS, bo nie ma własnej
 *  strony /overlay/*. Zapis w tym samym JSON `elements` → zero zmian schematu. */
export const IMAGE_WIDGET = "image";
const IMAGE_DEFAULT = { w: 30, h: 30 };

/** Element „video" (update 2026-08): własne wideo/animacja streamera (mp4/webm, upload lub URL) jako
 *  element sceny — daje SCENY Z ANIMACJĄ (nie tylko statyczne obrazy). Renderowane jako <video>
 *  autoplay/muted/loop (OBS nie ma interakcji), NIE iframe; `src` przez ten sam `safeMediaUrl` co
 *  „image". Zapis w tym samym JSON `elements` → zero zmian schematu. Domyślny rozmiar ~16:9. */
export const VIDEO_WIDGET = "video";
const VIDEO_DEFAULT = { w: 40, h: 23 };

/** Elementy z własnym mediów-`src` (nie iframe widgetu): grafika i wideo. */
export const MEDIA_WIDGETS = new Set([IMAGE_WIDGET, VIDEO_WIDGET]);

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

/** Element sceny. `enabled` (update 2026-08) pozwala WYŁĄCZYĆ pojedynczy element bez kasowania go:
 *  zostaje na płótnie edytora (wyszarzony), ale render OBS go pomija. Pole jest OPCJONALNE i
 *  domyślnie „włączone" — dzięki temu wszystkie sceny zapisane przed tą zmianą (bez `enabled`)
 *  renderują się dalej bez migracji danych. Zapisujemy je tylko wtedy, gdy element jest wyłączony
 *  (patrz `clampElement`), żeby nie puchł JSON `elements` i nie zmieniał się dla nikogo innego. */
export type SceneElement = { id: string; widget: string; x: number; y: number; w: number; h: number; src?: string; enabled?: boolean };

/** Czy element ma się renderować w OBS. Brak pola = włączony (zgodność wsteczna). */
export function elementEnabled(el: SceneElement): boolean {
  return el.enabled !== false;
}

export const MAX_ELEMENTS = 24;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Clamp an element to the canvas: size 4..100%, position kept fully on-canvas. Zachowuje `src`
 *  (element „image"), już zsanityzowany przez parseImage/parseElements, oraz `enabled` — ale tylko
 *  gdy jest `false`, bo „włączony" to domyślny stan i zapisywanie go zaśmiecałoby JSON. */
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
    ...(el.src ? { src: el.src } : {}),
    ...(el.enabled === false ? { enabled: false } : {}),
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

    // Elementy mediów („image"/„video"): własna grafika lub wideo/animacja streamera. Wymagają
    // bezpiecznego http(s) URL — safeMediaUrl odrzuca javascript:/data:/relatywne i breakout;
    // brak/nieprawidłowy src → element dropowany (nie renderujemy pustego <img>/<video>). NIE są
    // w SCENE_WIDGETS (nie mają strony /overlay/*). „video" → <video> autoplay/muted/loop w renderze.
    if (MEDIA_WIDGETS.has(widget)) {
      const src = safeMediaUrl(typeof r.src === "string" ? r.src : "");
      if (!src) continue;
      const def = widget === VIDEO_WIDGET ? VIDEO_DEFAULT : IMAGE_DEFAULT;
      out.push(
        clampElement({
          id: String(r.id ?? `${widget}-${out.length}`),
          widget,
          x: Number(r.x) || 0,
          y: Number(r.y) || 0,
          w: Number(r.w) || def.w,
          h: Number(r.h) || def.h,
          src,
          enabled: r.enabled !== false,
        }),
      );
      continue;
    }

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
        enabled: r.enabled !== false,
      }),
    );
  }
  return out;
}
