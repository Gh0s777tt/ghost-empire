import { describe, it, expect } from "vitest";
import { shouldAnimateNavigation } from "@/lib/view-transition";

const plainLeftClick = { defaultPrevented: false, button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false };
const sameOrigin = { targetBlank: false, samePath: false };

describe("shouldAnimateNavigation", () => {
  it("animates an ordinary primary-button click to a different path", () => {
    expect(shouldAnimateNavigation(plainLeftClick, sameOrigin)).toBe(true);
  });

  it("skips when the event was already handled", () => {
    expect(shouldAnimateNavigation({ ...plainLeftClick, defaultPrevented: true }, sameOrigin)).toBe(false);
  });

  it("skips middle/non-primary mouse buttons", () => {
    expect(shouldAnimateNavigation({ ...plainLeftClick, button: 1 }, sameOrigin)).toBe(false);
  });

  it("skips modifier clicks (open in new tab/window/download)", () => {
    expect(shouldAnimateNavigation({ ...plainLeftClick, metaKey: true }, sameOrigin)).toBe(false);
    expect(shouldAnimateNavigation({ ...plainLeftClick, ctrlKey: true }, sameOrigin)).toBe(false);
    expect(shouldAnimateNavigation({ ...plainLeftClick, shiftKey: true }, sameOrigin)).toBe(false);
    expect(shouldAnimateNavigation({ ...plainLeftClick, altKey: true }, sameOrigin)).toBe(false);
  });

  it("skips links that open in a new tab", () => {
    expect(shouldAnimateNavigation(plainLeftClick, { targetBlank: true, samePath: false })).toBe(false);
  });

  it("skips navigations to the current path", () => {
    expect(shouldAnimateNavigation(plainLeftClick, { targetBlank: false, samePath: true })).toBe(false);
  });
});
