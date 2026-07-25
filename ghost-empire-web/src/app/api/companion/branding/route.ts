// src/app/api/companion/branding/route.ts
// PUBLIC per-portal branding for the NX Companion extension, so it themes itself
// with THIS portal's currency name/symbol, brand colour, logo and name. Tenant
// resolved from the request Host (the extension calls <portalUrl>/api/companion/
// branding). Read-only, no auth, no sensitive data → permissive CORS. Multi-tenant
// by construction (every portal returns its own branding).
//
// ⚠️ NOT extension-only any more: **ghost-empire-chat (the chat bot) is a second consumer**
// — src/branding.ts TTL-caches this response to name the currency in viewer-facing
// Twitch/Kick/YouTube messages. The bot is a plain server process with no session and no
// user, so it can only read this while the endpoint stays PUBLIC and unauthenticated.
// Adding auth, a session requirement, or an allow-list of extension origins would silently
// send every portal's chat back to brand-neutral fallback wording ("tokeny"). Keep it public;
// it exposes nothing a visitor can't already see on the page.
import { NextResponse } from "next/server";
import { getCurrentTenant } from "@/lib/tenant";
import { rateLimit } from "@/lib/rate-limit";
import { extractIp } from "@/lib/audit";

export const dynamic = "force-dynamic";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
};

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function GET(req: Request) {
  const ip = extractIp(req) ?? "unknown";
  const rl = await rateLimit(`companion:branding:ip:${ip}`, 120, 60_000);
  if (!rl.allowed) return NextResponse.json({ error: "rate-limited" }, { status: 429, headers: CORS });

  const t = await getCurrentTenant();
  return NextResponse.json(
    {
      name: t.name,
      tokenName: t.tokenName,
      tokenSymbol: t.tokenSymbol,
      brandColor: t.brandColor,
      logoUrl: t.logoUrl,
    },
    { headers: CORS },
  );
}
