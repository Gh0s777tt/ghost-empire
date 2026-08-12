// src/app/api/admin/twitch-streamer-auth/route.ts
// Special Twitch OAuth flow for the STREAMER (Gh0s77tt) — grants extra scopes
// needed for EventSub (channel:read:subscriptions + bits:read) and the AI Clip
// Director's auto-clip creation (clips:edit, #517).
//
// Result: TwitchStreamerToken row saved with the streamer's user access token,
// which is then used to create EventSub subscriptions for their channel.
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireAdmin } from "@/lib/admin";
import { signOAuthState } from "@/lib/oauth-state";
import { currentTenantId } from "@/lib/tenant";
import { requestOrigin } from "@/lib/http";

const STREAMER_SCOPES = "channel:read:subscriptions bits:read channel:read:hype_train moderator:read:followers clips:edit";

export async function GET(req: Request) {
  // Per-host origin (audyt 2026-08): redirect_uri musi wracać na host STREAMERA, nie na
  // zaszyty host foundera — inaczej sub-tenant ląduje na callbacku bez sesji i requireAdmin
  // go odrzuca (nie podłączy WŁASNEGO Twitcha). Ten sam origin w authorize i w wymianie kodu.
  const base = requestOrigin(req);
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.redirect(new URL("/admin?twitch_error=unauthorized", base));
  }

  // Signed state carries {tenantId, userId} — the shared OAuth app returns all
  // tenants to ONE callback URL, so the state is what identifies the tenant.
  const { state, nonce } = signOAuthState({
    tenantId: await currentTenantId(),
    userId: auth.userId,
    provider: "twitch-streamer",
  });
  const cookieStore = await cookies();
  cookieStore.set("twitch_streamer_state", nonce, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  const params = new URLSearchParams({
    client_id: process.env.TWITCH_CLIENT_ID ?? "",
    redirect_uri: base + "/api/admin/twitch-streamer-auth/callback",
    response_type: "code",
    scope: STREAMER_SCOPES,
    state,
    force_verify: "true", // ensure user re-consents even if already authorized
  });

  return NextResponse.redirect(`https://id.twitch.tv/oauth2/authorize?${params.toString()}`);
}
