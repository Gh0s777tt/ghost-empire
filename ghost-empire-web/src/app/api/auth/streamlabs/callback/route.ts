// src/app/api/auth/streamlabs/callback/route.ts
// Streamlabs OAuth callback — exchanges code for token, stores in DB.
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { exchangeCode, fetchUserInfo, tokenExpiryFrom } from "@/lib/streamlabs";
import { logAdminAction } from "@/lib/audit";
import { encryptSecret } from "@/lib/crypto";
import { verifyOAuthState } from "@/lib/oauth-state";
import { tokenUpsertKeys } from "@/lib/platform-tokens";
import { requestOrigin } from "@/lib/http";
import { createLogger, errContext } from "@/lib/logger";

const log = createLogger("streamlabs");

export async function GET(req: Request) {
  // Per-host (audyt 2026-08): origin z hosta STREAMERA, nie zaszytego NEXTAUTH_URL — inaczej
  // sub-tenant nie ma tu sesji i requireAdmin go blokuje. Ten sam origin w authorize i exchange.
  const base = requestOrigin(req);
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.redirect(new URL("/admin?streamlabs_error=unauthorized", base));
  }

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    return NextResponse.redirect(new URL(`/admin?streamlabs_error=${encodeURIComponent(error)}`, base));
  }
  if (!code) {
    return NextResponse.redirect(new URL("/admin?streamlabs_error=no_code", base));
  }

  // Signed state → {tenantId, userId}; cookie nonce pins it to this browser.
  const payload = verifyOAuthState(state, "streamlabs");
  if (!payload) {
    return NextResponse.redirect(new URL("/admin?streamlabs_error=state_mismatch", base));
  }
  const cookieStore = await cookies();
  const cookieNonce = cookieStore.get("streamlabs_oauth_state")?.value;
  // Require the CSRF nonce cookie AND a match — a missing cookie must not skip the bind.
  if (!cookieNonce || cookieNonce !== payload.nonce) {
    return NextResponse.redirect(new URL("/admin?streamlabs_error=state_mismatch", base));
  }
  cookieStore.delete("streamlabs_oauth_state");

  // Exchange code for token
  let token;
  try {
    token = await exchangeCode(code, base + "/api/auth/streamlabs/callback");
  } catch (e) {
    log.error("token exchange failed", e);
    return NextResponse.redirect(new URL("/admin?streamlabs_error=token_exchange", base));
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
    log.warn("user info fetch failed", errContext(e));
  }

  // Shared with the poller's refresh path so a connection ALWAYS lands with a known expiry —
  // a null `tokenExpiresAt` makes every poll refresh (see needsTokenRefresh). #801
  const expiresAt = tokenExpiryFrom(token.expires_in);

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

  return NextResponse.redirect(new URL("/admin?streamlabs_success=1", base));
}
