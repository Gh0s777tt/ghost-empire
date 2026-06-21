import { describe, it, expect } from "vitest";
import { VIEWER_PREVIEW_COOKIE, readViewerPreview, viewerPreviewCookie } from "@/lib/viewer-preview";

describe("readViewerPreview", () => {
  it("is true only for the literal '1'", () => {
    expect(readViewerPreview("1")).toBe(true);
  });
  it("is false for everything else", () => {
    expect(readViewerPreview(undefined)).toBe(false);
    expect(readViewerPreview(null)).toBe(false);
    expect(readViewerPreview("")).toBe(false);
    expect(readViewerPreview("0")).toBe(false);
    expect(readViewerPreview("true")).toBe(false);
  });
});

describe("viewerPreviewCookie", () => {
  it("sets a 1-year cookie when enabling", () => {
    const c = viewerPreviewCookie(true);
    expect(c).toContain(`${VIEWER_PREVIEW_COOKIE}=1`);
    expect(c).toContain("path=/");
    expect(c).toContain("max-age=31536000");
    expect(c).toContain("samesite=lax");
  });
  it("expires the cookie when disabling", () => {
    const c = viewerPreviewCookie(false);
    expect(c).toContain(`${VIEWER_PREVIEW_COOKIE}=;`);
    expect(c).toContain("max-age=0");
  });
  it("round-trips through readViewerPreview via the value segment", () => {
    const val = viewerPreviewCookie(true).split(";")[0].split("=")[1];
    expect(readViewerPreview(val)).toBe(true);
  });
});
