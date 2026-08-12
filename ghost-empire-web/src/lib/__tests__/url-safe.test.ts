import { describe, it, expect } from "vitest";
import { safeMediaUrl } from "@/lib/url-safe";

describe("safeMediaUrl", () => {
  it("accepts http(s) URLs and returns the encoded href", () => {
    expect(safeMediaUrl("https://example.com/a.png")).toBe("https://example.com/a.png");
    // Bare origins gain their canonical trailing slash — this is the parser's href, and
    // #sec-css-injection requires returning href (not the raw input).
    expect(safeMediaUrl("http://example.com")).toBe("http://example.com/");
  });

  it("returns the percent-encoded href, never the raw input (#sec-css-injection)", () => {
    // A space in the path is encoded by the URL parser; we return that, not the raw string.
    expect(safeMediaUrl("https://x.com/a b.png")).toBe("https://x.com/a%20b.png");
  });

  it("rejects dangerous / non-http schemes → null", () => {
    expect(safeMediaUrl("javascript:alert(1)")).toBeNull();
    expect(safeMediaUrl("data:text/html,<script>alert(1)</script>")).toBeNull();
    expect(safeMediaUrl("vbscript:msgbox(1)")).toBeNull();
    expect(safeMediaUrl("ftp://example.com/file")).toBeNull();
  });

  it("rejects CSS `url()` breakout payloads → null (#sec-css-injection)", () => {
    // The core exploit: close url(), then inject a fresh declaration.
    expect(safeMediaUrl('https://x.com/a.png")}body{background:red}')).toBeNull();
    // Each individual breakout metacharacter is rejected on its own.
    expect(safeMediaUrl('https://x.com/a".png')).toBeNull();
    expect(safeMediaUrl("https://x.com/a).png")).toBeNull();
    expect(safeMediaUrl("https://x.com/a{png")).toBeNull();
    expect(safeMediaUrl("https://x.com/a}png")).toBeNull();
    expect(safeMediaUrl("https://x.com/a\npng")).toBeNull();
    // Backslash is rejected on the RAW input, before the URL parser rewrites `\`→`/`
    // (`https://x.com\evil` would otherwise normalize to `https://x.comevil/`).
    expect(safeMediaUrl("https://x.com\\evil")).toBeNull();
  });

  it("rejects relative / garbage / empty → null", () => {
    expect(safeMediaUrl("/relative/path.png")).toBeNull();
    expect(safeMediaUrl("not a url")).toBeNull();
    expect(safeMediaUrl("")).toBeNull();
    expect(safeMediaUrl("   ")).toBeNull();
    expect(safeMediaUrl(null)).toBeNull();
    expect(safeMediaUrl(undefined)).toBeNull();
  });

  it("trims surrounding whitespace", () => {
    expect(safeMediaUrl("  https://x.com/i.png  ")).toBe("https://x.com/i.png");
  });
});
