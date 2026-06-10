// src/app/api/auth/streamlabs/callback/route.ts
// Streamlabs OAuth callback — exchanges code for token, stores in DB.
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { exchangeCode, fetchUserInfo } from "@/lib/streamlabs";
import { logAdminAction } from "@/lib/audit";
import { encryptSecret } from "@/lib/crypto";
import { verifyOAuthState } from "@/lib/oauth-state";
import { tokenUpsertKeys } from "@/lib/platform-tokens";

const BASE = process.env.NEXTAUTH_URL ?? "https://ghost-empire-web.vercel.app";

export async function GET(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.redirect(new URL("/admin?streamlabs_error=unauthorized", BASE));
  }

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    return NextResponse.redirect(new URL(`/admin?streamlabs_error=${encodeURIComponent(error)}`, BASE));
  }
  if (!code) {
    return NextResponse.redirect(new URL("/admin?streamlabs_error=no_code", BASE));
  }

  // Signed state → {tenantId, userId}; cookie nonce pins it to this browser.
  const payload = verifyOAuthState(state, "streamlabs");
  if (!payload) {
    return NextResponse.redirect(new URL("/admin?streamlabs_error=state_mismatch", BASE));
  }
  const cookieStore = await cookies();
  const cookieNonce = cookieStore.get("streamlabs_oauth_state")?.value;
  if (cookieNonce && cookieNonce !== payload.nonce) {
    return NextResponse.redirect(new URL("/admin?streamlabs_error=state_mismatch", BASE));
  }
  cookieStore.delete("streamlabs_oauth_state");

  // Exchange code for token
  let token;
  try {
    token = await exchangeCode(code);
  } catch (e) {
    console.error("[streamlabs] token exchange failed:", e);
    return NextResponse.redirect(new URL("/admin?streamlabs_error=token_exchange", BASE));
  }

  // Fetch user info (optional — for display)
  let streamlabsUserId: string | null = null;
  let streamlabsUsername: string | null = null;
  try {
    const userInfo = await fetchUserInfo(token.access_token);
    if (userInfo.streamlabs) {
      streamlabsUserId = String(userInfo.streamlabs.id);
      streamlabsUsername = userInfo.streamlabs.display_name;
    } else if (userInfo.twitch) {
      streamlabsUsername = userInfo.twitch.display_name;
    }
  } catch (e) {
    console.warn("[streamlabs] user info fetch failed:", e);
  }

  const expiresAt = token.expires_in
    ? new Date(Date.now() + token.expires_in * 1000)
    : null;

  const keys = tokenUpsertKeys(payload.tenantId);
  await prisma.streamlabsConnection.upsert({
    where: keys.where,
    create: {
      ...keys.createKey,
      accessToken: encryptSecret(token.access_token),
      refreshToken: encryptSecret(token.refresh_token),
      tokenExpiresAt: expiresAt,
      scope: token.scope,
      streamlabsUserId,
      streamlabsUsername,
      connectedById: auth.userId,
    },
    update: {
      accessToken: encryptSecret(token.access_token),
      refreshToken: encryptSecret(token.refresh_token),
      tokenExpiresAt: expiresAt,
      scope: token.scope,
      streamlabsUserId,
      streamlabsUsername,
      connectedById: auth.userId,
      connectedAt: new Date(),
    },
  });

  await logAdminAction({
    adminId: auth.userId,
    action: "set_user_role",
    targetType: "streamlabs_connection",
    details: { streamlabsUsername, streamlabsUserId },
    req,
  });

  return NextResponse.redirect(new URL("/admin?streamlabs_success=1", BASE));
}
