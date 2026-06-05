import { describe, it, expect } from "vitest";
import { safeMediaUrl } from "@/lib/url-safe";

describe("safeMediaUrl", () => {
  it("accepts http(s) URLs unchanged", () => {
    expect(safeMediaUrl("https://example.com/a.png")).toBe("https://example.com/a.png");
    expect(safeMediaUrl("http://example.com")).toBe("http://example.com");
  });

  it("rejects dangerous / non-http schemes → null", () => {
    expect(safeMediaUrl("javascript:alert(1)")).toBeNull();
    expect(safeMediaUrl("data:text/html,<script>alert(1)</script>")).toBeNull();
    expect(safeMediaUrl("vbscript:msgbox(1)")).toBeNull();
    expect(safeMediaUrl("ftp://example.com/file")).toBeNull();
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
