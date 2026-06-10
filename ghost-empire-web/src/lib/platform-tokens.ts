// src/lib/platform-tokens.ts
// Tenant-aware access to the 4 per-streamer platform credentials
// (TwitchStreamerToken / KickStreamerToken / YouTubeStreamerToken /
// StreamlabsConnection). Phase-4 SaaS pattern, same as the config singletons
// (#235): rows are keyed by `tenantId @unique`; when no tenant is resolvable
// (pre-backfill, or single-tenant deployments) we fall back to the legacy
// `id: "default"` row so nothing breaks during rollout.
//
// `tenantId` parameter semantics (all getters):
//   undefined → resolve via currentTenantId() (Host-based on /api — #234)
//   string    → use that tenant (webhook handlers that mapped broadcaster→tenant)
//   null      → legacy row directly
import { prisma } from "@/lib/prisma";
import { currentTenantId } from "@/lib/tenant";

type Tid = string | null | undefined;

async function resolveTid(tenantId: Tid): Promise<string | null> {
  return tenantId === undefined ? await currentTenantId() : tenantId;
}

export async function getTwitchStreamerToken(tenantId?: Tid) {
  const tid = await resolveTid(tenantId);
  if (tid) {
    const row = await prisma.twitchStreamerToken.findUnique({ where: { tenantId: tid } });
    if (row) return row;
  }
  return prisma.twitchStreamerToken.findUnique({ where: { id: "default" } });
}

export async function getKickStreamerToken(tenantId?: Tid) {
  const tid = await resolveTid(tenantId);
  if (tid) {
    const row = await prisma.kickStreamerToken.findUnique({ where: { tenantId: tid } });
    if (row) return row;
  }
  return prisma.kickStreamerToken.findUnique({ where: { id: "default" } });
}

export async function getYouTubeStreamerToken(tenantId?: Tid) {
  const tid = await resolveTid(tenantId);
  if (tid) {
    const row = await prisma.youTubeStreamerToken.findUnique({ where: { tenantId: tid } });
    if (row) return row;
  }
  return prisma.youTubeStreamerToken.findUnique({ where: { id: "default" } });
}

export async function getStreamlabsConnection(tenantId?: Tid) {
  const tid = await resolveTid(tenantId);
  if (tid) {
    const row = await prisma.streamlabsConnection.findUnique({ where: { tenantId: tid } });
    if (row) return row;
  }
  return prisma.streamlabsConnection.findUnique({ where: { id: "default" } });
}

/**
 * Upsert key for a token write: per-tenant row when the tenant is known,
 * the legacy "default" row otherwise. `create` must spread `createKey`.
 */
export function tokenUpsertKeys(tid: string | null) {
  return tid
    ? { where: { tenantId: tid } as const, createKey: { tenantId: tid } as const }
    : { where: { id: "default" } as const, createKey: { id: "default" } as const };
}

/** Map a Twitch broadcaster_user_id (from a webhook event) to its tenant. */
export async function tenantIdForTwitchBroadcaster(broadcasterId: string): Promise<string | null> {
  const row = await prisma.twitchStreamerToken.findFirst({
    where: { broadcasterId },
    select: { tenantId: true },
  });
  return row?.tenantId ?? null;
}

/** Map a Kick broadcaster id (from a webhook event) to its tenant. */
export async function tenantIdForKickBroadcaster(broadcasterId: string): Promise<string | null> {
  const row = await prisma.kickStreamerToken.findFirst({
    where: { broadcasterId },
    select: { tenantId: true },
  });
  return row?.tenantId ?? null;
}
