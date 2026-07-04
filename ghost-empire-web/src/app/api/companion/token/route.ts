// src/app/api/companion/token/route.ts
// Mint a short-lived bearer token for the NX Companion extension. Session-authed
// and SAME-ORIGIN (the extension's portal bridge calls this from the portal page,
// where the session cookie is present) → returns a token the extension then uses
// on cross-origin reads (viewer on twitch.tv, portal API elsewhere). Stateless
// (HMAC-signed, see lib/companion-token.ts) so no DB row / migration.
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { jsonError } from "@/lib/api-i18n";
import { currentTenantId } from "@/lib/tenant";
import { signCompanionToken } from "@/lib/companion-token";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// CORS: the bridge calls same-origin, but keep it permissive for the extension.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
};

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) return jsonError("Musisz być zalogowany", 401);

  const rl = await rateLimit(`companion:token:${session.user.id}`, 20, 60_000);
  if (!rl.allowed) return jsonError("Za dużo prób", 429, rateLimitHeaders(rl));

  const tid = await currentTenantId();
  const token = signCompanionToken(session.user.id, tid);
  return NextResponse.json({ token, expiresInDays: 7 }, { headers: CORS });
}
