import { describe, it, expect } from "vitest";
import {
  ALERT_ANIMATIONS,
  ALERT_POSITIONS,
  ANIMATION_LABELS,
  POSITION_LABELS,
  DEFAULT_ALERT_TYPE_CFG,
  scaleOriginFor,
  resolveAlertAnchorStyle,
  type AlertPosition,
} from "@/lib/alert-types";

describe("alert-types data integrity", () => {
  it("every animation has a label", () => {
    for (const a of ALERT_ANIMATIONS) {
      expect(ANIMATION_LABELS[a]).toBeTruthy();
    }
  });

  it("every position has a label", () => {
    for (const p of ALERT_POSITIONS) {
      expect(POSITION_LABELS[p]).toBeTruthy();
    }
  });

  it("the default config uses valid enum values", () => {
    expect(ALERT_ANIMATIONS).toContain(DEFAULT_ALERT_TYPE_CFG.animation);
    expect(ALERT_POSITIONS).toContain(DEFAULT_ALERT_TYPE_CFG.position);
    // Default must reproduce the original overlay behaviour.
    expect(DEFAULT_ALERT_TYPE_CFG.animation).toBe("slide");
    expect(DEFAULT_ALERT_TYPE_CFG.position).toBe("bottom-right");
    expect(DEFAULT_ALERT_TYPE_CFG.soundUrl).toBeNull();
    expect(DEFAULT_ALERT_TYPE_CFG.minAmount).toBeNull();
  });
});

describe("scaleOriginFor", () => {
  it("maps center to 'center'", () => {
    expect(scaleOriginFor("center")).toBe("center");
  });

  it("turns the hyphenated corner into a CSS transform-origin", () => {
    expect(scaleOriginFor("bottom-right")).toBe("bottom right");
    expect(scaleOriginFor("top-left")).toBe("top left");
    expect(scaleOriginFor("top-center")).toBe("top center");
  });
});

describe("resolveAlertAnchorStyle — outer placement", () => {
  it("anchors bottom-right with padding and no centering transform", () => {
    const { outer } = resolveAlertAnchorStyle("bottom-right", "slide", true);
    expect(outer.bottom).toBe(32);
    expect(outer.right).toBe(32);
    expect(outer.top).toBeUndefined();
    expect(outer.left).toBeUndefined();
    expect(outer.transform).toBeUndefined();
  });

  it("anchors top-left with padding", () => {
    const { outer } = resolveAlertAnchorStyle("top-left", "slide", true);
    expect(outer.top).toBe(32);
    expect(outer.left).toBe(32);
    expect(outer.bottom).toBeUndefined();
  });

  it("centers fully with a translate(-50%, -50%)", () => {
    const { outer } = resolveAlertAnchorStyle("center", "fade", true);
    expect(outer.top).toBe("50%");
    expect(outer.left).toBe("50%");
    expect(outer.transform).toBe("translate(-50%, -50%)");
  });

  it("horizontally centers an edge-anchored position", () => {
    const { outer } = resolveAlertAnchorStyle("top-center", "slide", true);
    expect(outer.top).toBe(32);
    expect(outer.left).toBe("50%");
    expect(outer.transform).toBe("translateX(-50%)");
  });
});

describe("resolveAlertAnchorStyle — inner animation", () => {
  it("slides in from the right when hidden, settles to 0 when visible", () => {
    const hidden = resolveAlertAnchorStyle("bottom-right", "slide", false).inner;
    expect(hidden.transform).toBe("translateX(120%)");
    expect(hidden.opacity).toBe(0);

    const shown = resolveAlertAnchorStyle("bottom-right", "slide", true).inner;
    expect(shown.transform).toBe("translate(0, 0)");
    expect(shown.opacity).toBe(1);
  });

  it("slides from the left for left-anchored positions", () => {
    expect(resolveAlertAnchorStyle("top-left", "slide", false).inner.transform).toBe("translateX(-120%)");
  });

  it("slides down from the top for top-center", () => {
    expect(resolveAlertAnchorStyle("top-center", "slide", false).inner.transform).toBe("translateY(-120%)");
  });

  it("slides up from the bottom for bottom-center", () => {
    expect(resolveAlertAnchorStyle("bottom-center", "slide", false).inner.transform).toBe("translateY(120%)");
  });

  it("uses a scale transform for the scale animation", () => {
    expect(resolveAlertAnchorStyle("center", "scale", false).inner.transform).toBe("scale(0.85)");
    expect(resolveAlertAnchorStyle("center", "scale", true).inner.transform).toBe("scale(1)");
  });

  it("fades without moving (translate stays at 0)", () => {
    const hidden = resolveAlertAnchorStyle("bottom-right", "fade", false).inner;
    expect(hidden.transform).toBe("translate(0, 0)");
    expect(hidden.opacity).toBe(0);
  });

  it("disables the transition entirely for the 'none' animation", () => {
    expect(resolveAlertAnchorStyle("bottom-right", "none", true).inner.transition).toBe("none");
  });

  it("applies a transition for animated types", () => {
    const t = resolveAlertAnchorStyle("bottom-right", "slide", true).inner.transition as string;
    expect(t).not.toBe("none");
    expect(t).toContain("transform");
  });

  it("produces a transform for every position without throwing", () => {
    for (const p of ALERT_POSITIONS as readonly AlertPosition[]) {
      const { inner, outer } = resolveAlertAnchorStyle(p, "slide", false);
      expect(typeof inner.transform).toBe("string");
      expect(outer.position).toBe("absolute");
    }
  });
});
