// src/app/api/admin/kick-streamer-auth/callback/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { logAdminAction } from "@/lib/audit";
import { exchangeUserCode, getOwnUser } from "@/lib/kick";

const BASE = process.env.NEXTAUTH_URL ?? "https://ghost-empire-web.vercel.app";

export async function GET(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.redirect(new URL("/admin?kick_error=unauthorized", BASE));
  }

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    return NextResponse.redirect(new URL(`/admin?kick_error=${encodeURIComponent(error)}#kick`, BASE));
  }
  if (!code) {
    return NextResponse.redirect(new URL("/admin?kick_error=no_code#kick", BASE));
  }

  const cookieStore = await cookies();
  const expectedState = cookieStore.get("kick_streamer_state")?.value;
  const verifier = cookieStore.get("kick_streamer_verifier")?.value;
  if (!expectedState || expectedState !== state) {
    return NextResponse.redirect(new URL("/admin?kick_error=state_mismatch#kick", BASE));
  }
  if (!verifier) {
    return NextResponse.redirect(new URL("/admin?kick_error=missing_verifier#kick", BASE));
  }
  cookieStore.delete("kick_streamer_state");
  cookieStore.delete("kick_streamer_verifier");

  const redirectUri = BASE + "/api/admin/kick-streamer-auth/callback";
  let tokenData: Awaited<ReturnType<typeof exchangeUserCode>>;
  try {
    tokenData = await exchangeUserCode(code, redirectUri, verifier);
  } catch (e) {
    console.error("[kick-streamer] token exchange failed:", e);
    return NextResponse.redirect(new URL("/admin?kick_error=token_exchange#kick", BASE));
  }

  const user = await getOwnUser(tokenData.access_token);
  if (!user) {
    return NextResponse.redirect(new URL("/admin?kick_error=user_fetch#kick", BASE));
  }

  const expiresAt = tokenData.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000) : null;
  const broadcasterLogin = user.name || `kick_${user.userId}`;  // never empty — column is required

  try {
    await prisma.kickStreamerToken.upsert({
      where: { id: "default" },
      create: {
        id: "default",
        broadcasterId: user.userId,
        broadcasterLogin,
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token ?? null,
        tokenExpiresAt: expiresAt,
        scope: tokenData.scope ?? "",
        connectedById: auth.userId,
      },
      update: {
        broadcasterId: user.userId,
        broadcasterLogin,
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token ?? null,
        tokenExpiresAt: expiresAt,
        scope: tokenData.scope ?? "",
        connectedById: auth.userId,
        connectedAt: new Date(),
      },
    });
  } catch (e) {
    console.error("[kick-streamer] DB upsert failed:", e);
    return NextResponse.redirect(new URL("/admin?kick_error=db_save#kick", BASE));
  }

  await logAdminAction({
    adminId: auth.userId,
    action: "set_user_role",
    targetType: "kick_streamer_auth",
    details: { broadcasterId: user.userId, name: broadcasterLogin },
    req,
  });

  return NextResponse.redirect(new URL("/admin?kick_success=1#kick", BASE));
}
