// src/lib/codes.ts
// Helpers for the giveaway-code overlay (pool of codes shown one-at-a-time on
// /overlay/codes, rotating every CodeDropConfig.intervalSeconds).
import { prisma } from "@/lib/prisma";
import { currentTenantId } from "@/lib/tenant";

/** Rotation config (per-tenant); legacy id:"default" when no tenant. Lazy-created. */
export async function getCodeConfig() {
  const tid = await currentTenantId();
  if (tid) {
    const existing = await prisma.codeDropConfig.findFirst({ where: { tenantId: tid } });
    return existing ?? (await prisma.codeDropConfig.create({ data: { tenantId: tid } }));
  }
  return prisma.codeDropConfig.upsert({ where: { id: "default" }, create: { id: "default" }, update: {} });
}
