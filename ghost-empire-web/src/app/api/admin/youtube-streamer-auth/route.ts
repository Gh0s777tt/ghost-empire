// src/app/api/admin/youtube-streamer-auth/route.ts
// YouTube streamer auth — separate flow from user login, requests `youtube.readonly`
// so we can poll the streamer's live broadcast chat for super chats / member events.
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireAdmin } from "@/lib/admin";
import { getAuthorizeUrl } from "@/lib/youtube";
import { signOAuthState } from "@/lib/oauth-state";
import { currentTenantId } from "@/lib/tenant";

const BASE = process.env.NEXTAUTH_URL ?? "https://ghost-empire-web.vercel.app";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.redirect(new URL("/admin?yt_error=unauthorized", BASE));
  }

  // Signed state carries {tenantId, userId} (shared OAuth app → one callback URL)
  const { state, nonce } = signOAuthState({
    tenantId: await currentTenantId(),
    userId: auth.userId,
    provider: "youtube-streamer",
  });
  const cookieStore = await cookies();
  cookieStore.set("yt_streamer_state", nonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  const redirectUri = BASE + "/api/admin/youtube-streamer-auth/callback";
  return NextResponse.redirect(getAuthorizeUrl(state, redirectUri));
}
