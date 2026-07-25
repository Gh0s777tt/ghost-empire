import { describe, it, expect } from "vitest";
import { flowKind, economyHealth, flowForCurrency, splitSourcesSinks } from "@/lib/economy-health";

describe("flowKind", () => {
  it("treats positive (and zero) amounts as faucets, negative as sinks", () => {
    expect(flowKind(5000)).toBe("faucet");
    expect(flowKind(0)).toBe("faucet");
    expect(flowKind(-250)).toBe("sink");
  });
});

describe("economyHealth", () => {
  it("flags a faucet-dominated window as inflating", () => {
    const h = economyHealth(1000, 100);
    expect(h.burnRatio).toBeCloseTo(0.1);
    expect(h.status).toBe("inflating");
  });

  it("calls a balanced window healthy", () => {
    expect(economyHealth(1000, 700).status).toBe("healthy");
  });

  it("calls a sink-heavy window contracting", () => {
    expect(economyHealth(1000, 950).status).toBe("contracting");
    expect(economyHealth(500, 1000).status).toBe("contracting");
    expect(economyHealth(500, 1000).burnRatio).toBe(2);
  });

  it("reports an empty window as healthy (nothing to inflate)", () => {
    const h = economyHealth(0, 0);
    expect(h.burnRatio).toBe(0);
    expect(h.status).toBe("healthy");
  });

  it("treats burn with zero mint as infinite ratio (contracting)", () => {
    const h = economyHealth(0, 300);
    expect(h.burnRatio).toBe(Infinity);
    expect(h.status).toBe("contracting");
  });
});

describe("flowForCurrency — dwa obiegi z jednego groupBy", () => {
  const rows = [
    { currency: "GT", total: 10_000, count: 40 },
    { currency: "CHIPS", total: 500_000, count: 900 },
  ];

  it("wycina slice jednej waluty i nie miesza obiegów", () => {
    expect(flowForCurrency(rows, "GT")).toEqual({ total: 10_000, count: 40 });
    expect(flowForCurrency(rows, "CHIPS")).toEqual({ total: 500_000, count: 900 });
  });

  it("sumuje wiele kubełków tej samej waluty (groupBy po currency + reason)", () => {
    const byReason = [
      { currency: "GT", total: 100, count: 1 },
      { currency: "GT", total: 250, count: 2 },
      { currency: "CHIPS", total: 999, count: 9 },
    ];
    expect(flowForCurrency(byReason, "GT")).toEqual({ total: 350, count: 3 });
  });

  it("legacy/nieznana waluta liczy się jako GT (tak samo jak czyta ją shop/buy i planRefund)", () => {
    // Kolumna ma default "GT", ale gdyby kiedykolwiek pojawił się null/śmieć, wpadnięcie
    // do GT zaniża najwyżej… nic: alternatywa (ciche pominięcie) ZANIŻAŁABY realną ekonomię.
    const legacy = [
      { currency: null, total: 70, count: 1 },
      { currency: "gt", total: 30, count: 1 },
      { currency: "CHIPS", total: 5, count: 1 },
    ];
    expect(flowForCurrency(legacy, "GT")).toEqual({ total: 100, count: 2 });
    expect(flowForCurrency(legacy, "CHIPS")).toEqual({ total: 5, count: 1 });
  });

  it("brak wierszy danej waluty = zera, nie NaN (portal bez kasyna)", () => {
    expect(flowForCurrency([{ currency: "GT", total: 1, count: 1 }], "CHIPS")).toEqual({ total: 0, count: 0 });
    expect(flowForCurrency([], "GT")).toEqual({ total: 0, count: 0 });
  });
});

describe("splitSourcesSinks — krany vs spusty", () => {
  const reasons = [
    { reason: "chat_award", total: 900, count: 90 },
    { reason: "donation", total: 5_000, count: 5 },
    { reason: "shop:Klucz", total: -4_000, count: 2 },
    { reason: "casino_bet", total: -120, count: 12 },
    { reason: "zero", total: 0, count: 3 },
  ];

  it("dzieli po znaku, sortuje malejąco i zwraca spusty jako dodatnie (długość paska)", () => {
    const { sources, sinks } = splitSourcesSinks(reasons, 8);
    expect(sources.map((r) => r.reason)).toEqual(["donation", "chat_award"]);
    expect(sinks.map((r) => r.reason)).toEqual(["shop:Klucz", "casino_bet"]);
    expect(sinks[0].total).toBe(4_000); // magnituda, nie -4000
  });

  it("zero nie jest ani kranem, ani spustem", () => {
    const { sources, sinks } = splitSourcesSinks(reasons, 8);
    expect([...sources, ...sinks].some((r) => r.reason === "zero")).toBe(false);
  });

  it("przycina do topN po obu stronach", () => {
    const { sources, sinks } = splitSourcesSinks(reasons, 1);
    expect(sources).toHaveLength(1);
    expect(sinks).toHaveLength(1);
    expect(sources[0].reason).toBe("donation"); // największy, nie pierwszy z brzegu
  });

  it("nie mutuje wejścia (spusty są mapowane na kopie)", () => {
    const input = [{ reason: "shop", total: -10, count: 1 }];
    splitSourcesSinks(input, 8);
    expect(input[0].total).toBe(-10);
  });
});
