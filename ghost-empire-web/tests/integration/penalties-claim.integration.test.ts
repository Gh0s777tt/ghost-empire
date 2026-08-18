// Pokrycie DB-owe inwariantu AT-MOST-ONCE dla kar za donaty.
//
// Po co osobny plik: nagłówek `api/obs-control/penalties/route.ts` deklaruje „DELIVERY IS
// AT-MOST-ONCE", ale do 2026-08 kod tego NIE dowoził — payload budowano z surowego `findMany`,
// a stempel leciał na końcu jednym `updateMany` BEZ warunku `appliedAt: null`. Dwa równoległe
// odpytania (dwa źródła OBS, odświeżenie strony, retry) widziały ten sam nierozdany wiersz
// i OBA go dostawały. Kara, za którą widz ZAPŁACIŁ, wykonywała się na wizji dwa razy.
//
// Test celowo puszcza dwa żądania RÓWNOLEGLE na prawdziwym Postgresie — wyścig, którego nie da
// się odtworzyć testem jednostkowym, bo cała ochrona siedzi w blokadzie wiersza.
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { prisma } from "@/lib/prisma";

const TENANT_ID: string | null = null; // ścieżka legacy/bez portalu — ta sama, co founder

vi.mock("@/lib/tenant", () => ({ currentTenantId: async () => TENANT_ID }));
vi.mock("@/lib/alerts", () => ({ isValidOverlayToken: async () => true }));

const { GET } = await import("@/app/api/obs-control/penalties/route");

async function wyczysc() {
  await prisma.penaltyDraw.deleteMany({});
  await prisma.penalty.deleteMany({});
}
beforeEach(wyczysc);
afterAll(wyczysc);

async function losowanie(label = "Kara testowa") {
  const kara = await prisma.penalty.create({
    data: { tenantId: TENANT_ID, label, actionKind: "challenge", enabled: true, updatedAt: new Date() },
  });
  return prisma.penaltyDraw.create({
    data: {
      tenantId: TENANT_ID,
      penaltyId: kara.id,
      penaltyLabel: label, penaltyIndex: 0, amountGrosze: 500,
      intensity: 1,
      durationMs: 5000,
      startsAt: new Date(Date.now() - 1000), // wymagalne
      appliedAt: null,
    },
  });
}

const odpytaj = () => GET(new Request("https://portal.test/api/obs-control/penalties?token=x"));

describe("kary za donaty — at-most-once (integration, prawdziwa baza)", () => {
  it("SEDNO: dwa RÓWNOLEGŁE odpytania dostają karę łącznie raz", async () => {
    await losowanie();
    const [a, b] = await Promise.all([odpytaj(), odpytaj()]);
    const [ja, jb] = await Promise.all([a.json(), b.json()]);
    const razem = ja.penalties.length + jb.penalties.length;
    expect(razem).toBe(1); // przed poprawką: 2 — kara wykonana dwa razy na wizji
  });

  it("kolejne odpytanie nie dostaje już nic", async () => {
    await losowanie();
    expect((await (await odpytaj()).json()).penalties).toHaveLength(1);
    expect((await (await odpytaj()).json()).penalties).toHaveLength(0);
  });

  it("wiersz jest ostemplowany po wydaniu", async () => {
    const d = await losowanie();
    await odpytaj();
    const po = await prisma.penaltyDraw.findUnique({ where: { id: d.id } });
    expect(po?.appliedAt).toBeInstanceOf(Date);
  });

  it("kara jeszcze niewymagalna NIE jest wydawana ani stemplowana", async () => {
    const kara = await prisma.penalty.create({
      data: { tenantId: TENANT_ID, label: "Później", actionKind: "challenge", enabled: true, updatedAt: new Date() },
    });
    const d = await prisma.penaltyDraw.create({
      data: {
        tenantId: TENANT_ID, penaltyId: kara.id, penaltyLabel: "Później", penaltyIndex: 0, amountGrosze: 500, intensity: 1, durationMs: 1000,
        startsAt: new Date(Date.now() + 60_000), appliedAt: null,
      },
    });
    expect((await (await odpytaj()).json()).penalties).toHaveLength(0);
    expect((await prisma.penaltyDraw.findUnique({ where: { id: d.id } }))?.appliedAt).toBeNull();
  });

  it("losowanie wskazujące na SKASOWANĄ karę jest stemplowane, żeby nie kręcić gorącej pętli", async () => {
    const kara = await prisma.penalty.create({
      data: { tenantId: TENANT_ID, label: "Znikająca", actionKind: "challenge", enabled: true, updatedAt: new Date() },
    });
    const d = await prisma.penaltyDraw.create({
      data: {
        tenantId: TENANT_ID, penaltyId: kara.id, penaltyLabel: "Znikająca", penaltyIndex: 0, amountGrosze: 500, intensity: 1, durationMs: 1000,
        startsAt: new Date(Date.now() - 1000), appliedAt: null,
      },
    });
    await prisma.penalty.delete({ where: { id: kara.id } });
    expect((await (await odpytaj()).json()).penalties).toHaveLength(0);
    expect((await prisma.penaltyDraw.findUnique({ where: { id: d.id } }))?.appliedAt).toBeInstanceOf(Date);
  });
});
