// src/lib/scene-templates.ts
// Curated overlay-scene templates (#771) — "marketplace phase 1". Each template is a
// ready-made layout of existing scene widgets (percent coords on the 16:9 canvas) that
// one click turns into a real, editable OverlayScene. Curated (no UGC → no moderation);
// a community marketplace can build on the same shape later. Labels live in i18n
// (admin.sceneBuilder.tpl_<id>); this module stays pure and unit-tested.
import type { SceneElement } from "@/lib/overlay-scenes";

export type SceneTemplate = { id: string; icon: string; elements: SceneElement[] };

const el = (widget: string, x: number, y: number, w: number, h: number): SceneElement => ({
  id: `${widget}-t`,
  widget,
  x,
  y,
  w,
  h,
});

export const SCENE_TEMPLATES: readonly SceneTemplate[] = [
  {
    // Everyday streaming HUD: chat + goals + viewer count + support strip.
    id: "stream-hud",
    icon: "🎛️",
    elements: [
      el("chat", 70, 6, 28, 60),
      el("goals", 2, 4, 26, 30),
      el("viewers", 45, 3, 11, 7),
      el("support-goal", 2, 78, 19, 16),
      el("last-sub", 40, 88, 18, 8),
    ],
  },
  {
    // Community pride: clan, clan war, top supporters, emoji combos, companion.
    id: "community",
    icon: "🛡️",
    elements: [
      el("clan", 2, 4, 19, 13),
      el("clan-war", 2, 22, 20, 24),
      el("companion", 2, 50, 19, 13),
      el("top-supporters", 79, 6, 18, 30),
      el("emoji-combo", 40, 70, 21, 24),
    ],
  },
  {
    // Subathon / hype night: big timer + goals + QR + supporters.
    id: "hype",
    icon: "🔥",
    elements: [
      el("subathon", 34, 3, 31, 19),
      el("goals", 2, 30, 26, 30),
      el("support-qr", 82, 30, 16, 33),
      el("top-supporters", 79, 66, 18, 30),
      el("last-donator", 40, 88, 18, 8),
    ],
  },
  {
    // Interactive games night: wheel + predictions + trivia.
    id: "games",
    icon: "🎡",
    elements: [
      el("wheel", 3, 28, 21, 41),
      el("predictions", 72, 28, 26, 37),
      el("trivia", 38, 62, 23, 30),
      el("viewers", 45, 3, 11, 7),
    ],
  },
  {
    // Minimal clean look: tiny counters + compact chat.
    id: "minimal",
    icon: "◽",
    elements: [
      el("viewers", 2, 3, 11, 7),
      el("chat", 74, 30, 24, 50),
      el("last-donator", 2, 88, 18, 8),
    ],
  },
  {
    // Charity / fundraising: goal front and center + QR + supporters.
    id: "charity",
    icon: "💜",
    elements: [
      el("support-goal", 40, 4, 19, 16),
      el("top-supporters", 2, 32, 18, 30),
      el("support-qr", 82, 32, 16, 33),
      el("last-donator", 40, 88, 18, 8),
    ],
  },
];

const BY_ID = new Map(SCENE_TEMPLATES.map((t) => [t.id, t]));

export function sceneTemplate(id: unknown): SceneTemplate | null {
  return typeof id === "string" ? BY_ID.get(id) ?? null : null;
}
