// src/lib/__tests__/donations-tipply.test.ts
import { describe, it, expect } from "vitest";
import { parseTipplyWidgetId, parseTipplyTip, parseTipplyFeed, tipplyFeedUrl, tipplySince, selectFreshTips, TIPPLY_MAX_LOOKBACK_MS } from "@/lib/donations/tipply";

const UUID = "2f1c9b7e-4a3d-4f8b-9c2e-7d6a5b4c3e21";

describe("parseTipplyWidgetId", () => {
  it("accepts a bare UUID and a full widget URL", () => {
    expect(parseTipplyWidgetId(UUID)).toBe(UUID);
    expect(parseTipplyWidgetId(`https://widgets.tipply.pl/TIP_ALERT/${UUID}`)).toBe(UUID);
    expect(parseTipplyWidgetId(`  https://widgets.tipply.pl/TIP_ALERT/${UUID}/  `)).toBe(UUID);
    expect(parseTipplyWidgetId(UUID.toUpperCase())).toBe(UUID); // normalized to lower case
  });
  it("rejects anything that is not a UUID (so we never poll junk)", () => {
    for (const bad of ["", "   ", "not-a-uuid", "https://tipply.pl/panel", "1234"]) {
      expect(parseTipplyWidgetId(bad)).toBeNull();
    }
  });
});

describe("parseTipplyTip", () => {
  const tip = { id: "t-1", amount: 2500, commission: 250, nickname: "Ala", message: "GE-ABC234 hej!", createdAt: "2026-07-20T10:00:00Z" };

  it("treats the amount as GROSZE (no ×100) and ignores commission", () => {
    const d = parseTipplyTip(tip)!;
    expect(d.amountMinor).toBe(2500); // 25.00 PLN
    expect(d.currency).toBe("PLN");
  });

  it("is ALWAYS unverified — an undocumented, unsigned source may never mint", () => {
    expect(parseTipplyTip(tip)!.trust).toBe("unverified");
    expect(parseTipplyTip({ ...tip, amount: 100000 })!.trust).toBe("unverified");
  });

  it("keeps the message (it carries the GE-code) and the donor nick", () => {
    const d = parseTipplyTip(tip)!;
    expect(d.message).toContain("GE-ABC234");
    expect(d.donorName).toBe("Ala");
  });

  it("drops unusable rows instead of inventing values", () => {
    expect(parseTipplyTip({ ...tip, amount: 0 })).toBeNull();
    expect(parseTipplyTip({ ...tip, amount: -100 })).toBeNull();
    expect(parseTipplyTip({ ...tip, amount: "abc" })).toBeNull();
    expect(parseTipplyTip({ ...tip, amount: 9_000_000_000 })).toBeNull(); // int4 guard
    expect(parseTipplyTip(null as unknown as Record<string, unknown>)).toBeNull();
  });

  it("falls back to a deterministic id so re-polling the same tip dedupes", () => {
    const a = parseTipplyTip({ ...tip, id: undefined })!;
    const b = parseTipplyTip({ ...tip, id: undefined })!;
    expect(a.providerEventId).toBe(b.providerEventId);
    expect(a.providerEventId).toContain("tipply:syn:");
  });

  it("defaults a bad timestamp to now rather than an Invalid Date", () => {
    const d = parseTipplyTip({ ...tip, createdAt: "nonsense" })!;
    expect(Number.isNaN(d.donatedAt.getTime())).toBe(false);
  });

  it("drops a row that has NEITHER an id NOR a timestamp — it could not be deduped", () => {
    // Its synthetic id would hash a fresh `now` on every poll, so the same tip would enter the
    // reconciliation queue once per poll and could be approved several times.
    expect(parseTipplyTip({ ...tip, id: undefined, createdAt: undefined, created_at: undefined })).toBeNull();
    expect(parseTipplyTip({ ...tip, id: undefined, createdAt: "nonsense" })).toBeNull();
    expect(parseTipplyTip({ ...tip, id: "t-9", createdAt: "nonsense" })).not.toBeNull(); // id is enough
  });
});

describe("parseTipplyFeed", () => {
  it("handles a bare array and a {data:[…]} envelope, skipping bad rows", () => {
    const good = { id: "a", amount: 500, nickname: "X" };
    expect(parseTipplyFeed([good, { amount: 0 }, good])).toHaveLength(2);
    expect(parseTipplyFeed({ data: [good] })).toHaveLength(1);
    expect(parseTipplyFeed(null)).toHaveLength(0);
    expect(parseTipplyFeed({})).toHaveLength(0);
  });
});

describe("tipplyFeedUrl", () => {
  it("builds the public last-tips URL", () => {
    expect(tipplyFeedUrl(UUID)).toBe(`https://tipply.pl/api/widget/last-tips/${UUID}?limit=25`);
  });
});

describe("tipplySince / selectFreshTips (first-poll backfill guard)", () => {
  const now = new Date("2026-07-25T12:00:00Z");
  /** selectFreshTips only reads `donatedAt`, so a minimal stand-in keeps the cases readable. */
  const t = (iso: string) => ({ donatedAt: new Date(iso) });

  it("never reaches before the integration was set up", () => {
    const createdAt = new Date("2026-07-25T11:30:00Z");
    expect(tipplySince(createdAt, null, now)).toEqual(createdAt);
  });

  it("caps the lookback even for a long-idle integration (no month-long replay)", () => {
    const createdAt = new Date("2026-01-01T00:00:00Z");
    expect(tipplySince(createdAt, null, now).getTime()).toBe(now.getTime() - TIPPLY_MAX_LOOKBACK_MS);
  });

  it("resumes just before the last ingest, keeping an overlap (duplicates are free, gaps are not)", () => {
    const createdAt = new Date("2026-07-20T00:00:00Z");
    const last = new Date("2026-07-25T11:50:00Z");
    const since = tipplySince(createdAt, last, now);
    expect(since.getTime()).toBeLessThan(last.getTime());  // overlap
    expect(since.getTime()).toBeGreaterThan(now.getTime() - TIPPLY_MAX_LOOKBACK_MS);
  });

  it("filters the page down to tips at or after the cutoff", () => {
    const since = new Date("2026-07-25T11:00:00Z");
    const page = [t("2026-07-25T10:00:00Z"), t("2026-07-25T11:00:00Z"), t("2026-07-25T11:59:00Z")];
    expect(selectFreshTips(page as never, since)).toHaveLength(2); // the 10:00 one is history
  });
});
