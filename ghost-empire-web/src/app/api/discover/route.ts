// src/app/api/discover/route.ts
// PUBLIC channel → portal discovery for the companion browser extension (and any
// external caller). Given a platform channel (e.g. twitch/xqc), returns the portal
// (tenant) whose owner handle matches — so the extension can resolve WHICH portal
// belongs to the streamer a viewer is watching, WITHOUT hardcoding any tenant.
//
// Read-only, no auth, no sensitive data — safe to expose with permissive CORS.
// Multi-tenant by construction: searches ALL tenants by ownerHandle; returns only
// public branding + the portal URL (custom domain or <slug>.<root-domain>).
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { portalUrl } from "@/lib/portal-hub";
import { rateLimit } from "@/lib/rate-limit";
import { extractIp } from "@/lib/audit";

export const dynamic = "force-dynamic";

const CORS = {
  "Access-Control-Allow-Origin": "*", // public info only; no credentials involved
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
};

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

const HANDLE_RE = /^[a-zA-Z0-9_]{1,40}$/;

export async function GET(req: Request) {
  const ip = extractIp(req) ?? "unknown";
  const rl = await rateLimit(`discover:ip:${ip}`, 120, 60_000);
  if (!rl.allowed) return NextResponse.json({ error: "rate-limited" }, { status: 429, headers: CORS });

  const url = new URL(req.url);
  const channel = (url.searchParams.get("channel") ?? "").trim().toLowerCase();
  // platform is accepted for forward-compat (twitch/kick) but ownerHandle is a
  // single public handle today — we match on it directly.
  if (!HANDLE_RE.test(channel)) {
    return NextResponse.json({ found: false }, { headers: CORS });
  }

  // Case-insensitive match on the streamer's public handle.
  const tenant = await prisma.tenant.findFirst({
    where: { ownerHandle: { equals: channel, mode: "insensitive" } },
    select: { slug: true, name: true, domain: true, ownerHandle: true },
  });

  if (!tenant) return NextResponse.json({ found: false }, { headers: CORS });

  const resolved = portalUrl({ slug: tenant.slug, domain: tenant.domain });
  return NextResponse.json(
    {
      found: true,
      slug: tenant.slug,
      name: tenant.name,
      ownerHandle: tenant.ownerHandle,
      // null when the portal isn't externally routable yet (no custom domain and
      // NEXT_PUBLIC_ROOT_DOMAIN unset) — the extension then falls back to the
      // portal(s) the user configured manually.
      portalUrl: resolved,
    },
    { headers: CORS },
  );
}
