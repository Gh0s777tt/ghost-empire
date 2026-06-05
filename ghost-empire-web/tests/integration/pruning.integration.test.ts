import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { pruneOldRecords } from "@/lib/pruning";
import { resetDb } from "./helpers";

const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (d: number) => new Date(Date.now() - d * DAY);

describe("pruning (integration, real DB)", () => {
  beforeEach(resetDb);
  afterAll(async () => { await prisma.$disconnect(); });

  it("deletes rows past their retention window and keeps fresh ones", async () => {
    await prisma.chatFeedMessage.createMany({
      data: [
        { platform: "twitch", username: "old", message: "stary", createdAt: daysAgo(5) },
        { platform: "twitch", username: "new", message: "świeży", createdAt: daysAgo(1) },
      ],
    });
    await prisma.streamAlert.createMany({
      data: [
        { type: "donation", title: "old", message: "x", createdAt: daysAgo(10) },
        { type: "donation", title: "new", message: "x", createdAt: daysAgo(1) },
      ],
    });
    await prisma.twitchEvent.createMany({
      data: [
        { eventId: "evt_old", type: "channel.subscribe", payload: "{}", receivedAt: daysAgo(40) },
        { eventId: "evt_new", type: "channel.subscribe", payload: "{}", receivedAt: daysAgo(5) },
      ],
    });

    const result = await pruneOldRecords();

    expect(result.chatFeedMessages).toBe(1);
    expect(result.streamAlerts).toBe(1);
    expect(result.twitchEvents).toBe(1);
    expect(result.totalDeleted).toBeGreaterThanOrEqual(3);

    expect(await prisma.chatFeedMessage.count()).toBe(1);
    expect(await prisma.streamAlert.count()).toBe(1);
    expect(await prisma.twitchEvent.count()).toBe(1);
  });

  it("only prunes READ notifications past the window", async () => {
    const user = await prisma.user.create({ data: { username: "notif_owner" }, select: { id: true } });
    await prisma.notification.createMany({
      data: [
        { userId: user.id, type: "system", title: "old-read", message: "x", read: true, createdAt: daysAgo(40) },
        { userId: user.id, type: "system", title: "old-unread", message: "x", read: false, createdAt: daysAgo(40) },
        { userId: user.id, type: "system", title: "fresh-read", message: "x", read: true, createdAt: daysAgo(1) },
      ],
    });

    const result = await pruneOldRecords();
    expect(result.notifications).toBe(1); // only the old + read one
    expect(await prisma.notification.count()).toBe(2);
  });
});
