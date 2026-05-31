// src/lib/codes.ts
// Helpers for the giveaway-code overlay (pool of codes shown one-at-a-time on
// /overlay/codes, rotating every CodeDropConfig.intervalSeconds).
import { prisma } from "@/lib/prisma";

/** Rotation config singleton — lazy-created on first read. */
export async function getCodeConfig() {
  return prisma.codeDropConfig.upsert({
    where: { id: "default" },
    create: { id: "default" },
    update: {},
  });
}
