// src/app/api/admin/twitch-streamer-auth/route.ts
// Special Twitch OAuth flow for the STREAMER (Gh0s77tt) — grants extra scopes
// needed for EventSub: channel:read:subscriptions + bits:read.
//
// Result: TwitchStreamerToken row saved with the streamer's user access token,
// which is then used to create EventSub subscriptions for their channel.
import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { requireAdmin } from "@/lib/admin";

const STREAMER_SCOPES = "channel:read:subscriptions bits:read channel:read:hype_train moderator:read:followers";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.redirect(new URL("/admin?twitch_error=unauthorized",
      process.env.NEXTAUTH_URL ?? "https://ghost-empire-web.vercel.app"));
  }

  const state = randomBytes(32).toString("hex");
  const cookieStore = await cookies();
  cookieStore.set("twitch_streamer_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  const params = new URLSearchParams({
    client_id: process.env.TWITCH_CLIENT_ID ?? "",
    redirect_uri: (process.env.NEXTAUTH_URL ?? "https://ghost-empire-web.vercel.app") + "/api/admin/twitch-streamer-auth/callback",
    response_type: "code",
    scope: STREAMER_SCOPES,
    state,
    force_verify: "true", // ensure user re-consents even if already authorized
  });

  return NextResponse.redirect(`https://id.twitch.tv/oauth2/authorize?${params.toString()}`);
}
