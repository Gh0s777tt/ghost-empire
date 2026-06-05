// src/app/api/admin/twitch-streamer-auth/callback/route.ts
// Twitch returns here after streamer grants scopes.
// Exchange code for token, look up broadcaster_id, save to TwitchStreamerToken.
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { logAdminAction } from "@/lib/audit";
import { encryptSecret } from "@/lib/crypto";

const BASE = process.env.NEXTAUTH_URL ?? "https://ghost-empire-web.vercel.app";

export async function GET(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.redirect(new URL("/admin?twitch_error=unauthorized", BASE));
  }

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    return NextResponse.redirect(new URL(`/admin?twitch_error=${encodeURIComponent(error)}`, BASE));
  }
  if (!code) {
    return NextResponse.redirect(new URL("/admin?twitch_error=no_code", BASE));
  }

  const cookieStore = await cookies();
  const expected = cookieStore.get("twitch_streamer_state")?.value;
  if (!expected || expected !== state) {
    return NextResponse.redirect(new URL("/admin?twitch_error=state_mismatch", BASE));
  }
  cookieStore.delete("twitch_streamer_state");

  // Exchange code → token
  const body = new URLSearchParams({
    client_id: process.env.TWITCH_CLIENT_ID ?? "",
    client_secret: process.env.TWITCH_CLIENT_SECRET ?? "",
    code,
    grant_type: "authorization_code",
    redirect_uri: BASE + "/api/admin/twitch-streamer-auth/callback",
  });
  const tokenRes = await fetch("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!tokenRes.ok) {
    const text = await tokenRes.text();
    console.error("[twitch-streamer] token exchange failed:", tokenRes.status, text);
    return NextResponse.redirect(new URL("/admin?twitch_error=token_exchange", BASE));
  }
  const tokenData = await tokenRes.json();

  // Get user info to determine broadcaster_id + login
  const userRes = await fetch("https://api.twitch.tv/helix/users", {
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`,
      "Client-Id": process.env.TWITCH_CLIENT_ID ?? "",
    },
  });
  if (!userRes.ok) {
    return NextResponse.redirect(new URL("/admin?twitch_error=user_fetch", BASE));
  }
  const userData = await userRes.json();
  const user = userData.data?.[0];
  if (!user) {
    return NextResponse.redirect(new URL("/admin?twitch_error=user_not_found", BASE));
  }

  const expiresAt = tokenData.expires_in
    ? new Date(Date.now() + tokenData.expires_in * 1000)
    : null;

  await prisma.twitchStreamerToken.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      broadcasterId: user.id,
      broadcasterLogin: user.login,
      accessToken: encryptSecret(tokenData.access_token),
      refreshToken: encryptSecret(tokenData.refresh_token),
      tokenExpiresAt: expiresAt,
      scope: Array.isArray(tokenData.scope) ? tokenData.scope.join(" ") : (tokenData.scope ?? ""),
      connectedById: auth.userId,
    },
    update: {
      broadcasterId: user.id,
      broadcasterLogin: user.login,
      accessToken: encryptSecret(tokenData.access_token),
      refreshToken: encryptSecret(tokenData.refresh_token),
      tokenExpiresAt: expiresAt,
      scope: Array.isArray(tokenData.scope) ? tokenData.scope.join(" ") : (tokenData.scope ?? ""),
      connectedById: auth.userId,
      connectedAt: new Date(),
    },
  });

  await logAdminAction({
    adminId: auth.userId,
    action: "set_user_role",
    targetType: "twitch_streamer_auth",
    details: { broadcasterId: user.id, login: user.login },
    req,
  });

  return NextResponse.redirect(new URL("/admin?twitch_success=1", BASE));
}
