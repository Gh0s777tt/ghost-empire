// src/app/api/admin/youtube-streamer-auth/callback/route.ts
// Receives Google OAuth callback after streamer grants youtube.readonly scope.
// Exchanges code for tokens, fetches channel info, persists in YouTubeStreamerToken.
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { logAdminAction } from "@/lib/audit";
import { encryptSecret } from "@/lib/crypto";
import { exchangeCodeForToken, getOwnChannel } from "@/lib/youtube";
import { verifyOAuthState } from "@/lib/oauth-state";
import { tokenUpsertKeys } from "@/lib/platform-tokens";

const BASE = process.env.NEXTAUTH_URL ?? "https://ghost-empire-web.vercel.app";

export async function GET(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.redirect(new URL("/admin?yt_error=unauthorized", BASE));
  }

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    return NextResponse.redirect(new URL(`/admin?yt_error=${encodeURIComponent(error)}`, BASE));
  }
  if (!code) {
    return NextResponse.redirect(new URL("/admin?yt_error=no_code", BASE));
  }

  const payload = verifyOAuthState(state, "youtube-streamer");
  if (!payload) {
    return NextResponse.redirect(new URL("/admin?yt_error=state_mismatch", BASE));
  }
  const cookieStore = await cookies();
  const cookieNonce = cookieStore.get("yt_streamer_state")?.value;
  if (cookieNonce && cookieNonce !== payload.nonce) {
    return NextResponse.redirect(new URL("/admin?yt_error=state_mismatch", BASE));
  }
  cookieStore.delete("yt_streamer_state");

  const redirectUri = BASE + "/api/admin/youtube-streamer-auth/callback";

  let tokenData: Awaited<ReturnType<typeof exchangeCodeForToken>>;
  try {
    tokenData = await exchangeCodeForToken(code, redirectUri);
  } catch (e) {
    console.error("[yt-streamer] token exchange failed:", e);
    return NextResponse.redirect(new URL("/admin?yt_error=token_exchange", BASE));
  }

  if (!tokenData.refresh_token) {
    // refresh_token only sent on first consent — if user already authorized previously
    // without revoking, Google won't send it. `prompt=consent` should force it but
    // double-check here.
    return NextResponse.redirect(
      new URL("/admin?yt_error=no_refresh_token_revoke_at_myaccount", BASE),
    );
  }

  // Look up channel info to store channelId + title
  const channel = await getOwnChannel(tokenData.access_token);
  if (!channel) {
    return NextResponse.redirect(new URL("/admin?yt_error=no_channel", BASE));
  }

  const expiresAt = new Date(Date.now() + (tokenData.expires_in ?? 3600) * 1000);

  const keys = tokenUpsertKeys(payload.tenantId);
  await prisma.youTubeStreamerToken.upsert({
    where: keys.where,
    create: {
      ...keys.createKey,
      channelId: channel.id,
      channelTitle: channel.title,
      accessToken: encryptSecret(tokenData.access_token),
      refreshToken: encryptSecret(tokenData.refresh_token),
      tokenExpiresAt: expiresAt,
      scope: tokenData.scope,
      connectedById: auth.userId,
    },
    update: {
      channelId: channel.id,
      channelTitle: channel.title,
      accessToken: encryptSecret(tokenData.access_token),
      refreshToken: encryptSecret(tokenData.refresh_token),
      tokenExpiresAt: expiresAt,
      scope: tokenData.scope,
      connectedById: auth.userId,
      connectedAt: new Date(),
      // Reset polling state — new channel may differ
      currentLiveVideoId: null,
      currentLiveChatId: null,
      lastChatPageToken: null,
    },
  });

  await logAdminAction({
    adminId: auth.userId,
    action: "set_user_role",
    targetType: "youtube_streamer_auth",
    details: { channelId: channel.id, channelTitle: channel.title },
    req,
  });

  return NextResponse.redirect(new URL("/admin?yt_success=1#youtube", BASE));
}
