// src/app/api/overlay/stream/[feed]/route.ts
// Generic realtime (SSE) transport for the OBS overlays — pushes each overlay's
// current state instead of the page polling /api/alerts/<feed>. One endpoint
// serves every feed via the lib/overlay-feeds registry; the overlay page falls
// back to polling if this is unreachable (zero-risk on stream).
//
// Self-closes before the platform's function-duration cap (see lib/sse); the
// browser's EventSource transparently reconnects.
import { isValidOverlayToken } from "@/lib/alerts";
import { getOverlayFeed } from "@/lib/overlay-feeds";
import { sseFrame, sseStreamResponse } from "@/lib/sse";
import { currentTenantId } from "@/lib/tenant";
import { featureGateResponse } from "@/lib/entitlements";

export const dynamic = "force-dynamic";
export const runtime = "nodejs"; // Prisma (pg driver adapter) needs Node, not Edge.
export const maxDuration = 60; // Vercel Pro ceiling; the stream self-closes at 50s.

export async function GET(req: Request, ctx: { params: Promise<{ feed: string }> }) {
  const { feed } = await ctx.params;
  const def = getOverlayFeed(feed);
  if (!def) return new Response("Unknown feed", { status: 404 });

  // Tenant is resolved ONCE here (request Host — the OBS URL points at the
  // tenant's subdomain) and threaded into every tick: the SSE loop runs in a
  // setTimeout outside the request scope, where headers() is unreliable.
  const tenantId = await currentTenantId();

  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  if (!(await isValidOverlayToken(token, tenantId))) {
    return new Response("Unauthorized", { status: 401 });
  }

  // Overlays are a pro feature — gate the data feed so a basic/downgraded tenant's
  // OBS sources go dark (the token alone doesn't encode entitlement).
  const gated = await featureGateResponse("overlays");
  if (gated) return gated;

  // Snapshot the query (e.g. widget `id`) for the producer; URLSearchParams is
  // bound to the request, so capture it before the request is consumed.
  const params = new URLSearchParams(url.searchParams);

  return sseStreamResponse({
    signal: req.signal,
    tickMs: def.intervalMs,
    onTick: async (send) => {
      const payload = await def.producer(params, tenantId);
      send(sseFrame("data", payload));
    },
  });
}
