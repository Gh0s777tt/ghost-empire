import { describe, it, expect } from "vitest";
import {
  anomalyReasons,
  SINGLE_GRANT_THRESHOLD,
  HOURLY_GRANT_THRESHOLD,
} from "@/lib/economy-anomaly";

describe("anomalyReasons (czysta logika progów anty-nadużyć)", () => {
  it("nic anomalnego poniżej obu progów", () => {
    expect(anomalyReasons(SINGLE_GRANT_THRESHOLD - 1, HOURLY_GRANT_THRESHOLD - 1)).toEqual([]);
  });

  it("flaguje pojedynczy duży grant", () => {
    const r = anomalyReasons(SINGLE_GRANT_THRESHOLD, 0);
    expect(r).toHaveLength(1);
    expect(r[0]).toContain("pojedynczy grant");
  });

  it("flaguje sumę godzinową grantów", () => {
    const r = anomalyReasons(1, HOURLY_GRANT_THRESHOLD);
    expect(r).toHaveLength(1);
    expect(r[0]).toContain("ostatniej godzinie");
  });

  it("oba progi przekroczone → dwa powody", () => {
    expect(anomalyReasons(SINGLE_GRANT_THRESHOLD, HOURLY_GRANT_THRESHOLD)).toHaveLength(2);
  });

  it("progi są inkluzywne (>=): dokładna wartość progu flaguje, o 1 mniej nie", () => {
    expect(anomalyReasons(SINGLE_GRANT_THRESHOLD, 0)).toHaveLength(1);
    expect(anomalyReasons(SINGLE_GRANT_THRESHOLD - 1, 0)).toHaveLength(0);
    expect(anomalyReasons(0, HOURLY_GRANT_THRESHOLD)).toHaveLength(1);
    expect(anomalyReasons(0, HOURLY_GRANT_THRESHOLD - 1)).toHaveLength(0);
  });

  it("zero/wartości poniżej progu → brak flag", () => {
    expect(anomalyReasons(0, 0)).toEqual([]);
  });

  it("kwota jest formatowana w powodzie (pl-PL, separator tysięcy)", () => {
    const r = anomalyReasons(SINGLE_GRANT_THRESHOLD, 0);
    // 100000 → "100 000" (pl-PL używa spacji/nbsp jako separatora)
    expect(r[0]).toMatch(/100[\s ]?000/);
  });
});
