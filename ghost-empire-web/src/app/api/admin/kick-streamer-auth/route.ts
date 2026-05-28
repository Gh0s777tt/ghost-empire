// src/app/api/admin/kick-streamer-auth/route.ts
// Streamer authorizes Kick with extra scopes (events:subscribe) so we can
// create webhook subscriptions for their channel.
import { NextResponse } from "next/server";
import { randomBytes, createHash } from "node:crypto";
import { cookies } from "next/headers";
import { requireAdmin } from "@/lib/admin";
import { getStreamerAuthorizeUrl } from "@/lib/kick";

// Strip any trailing slash so we never build "...app//api/..." which Kick rejects
// as an invalid redirect_uri (must byte-match the registered URI).
const BASE = (process.env.NEXTAUTH_URL ?? "https://ghost-empire-web.vercel.app").replace(/\/+$/, "");

function base64url(buf: Buffer): string {
  return buf.toString("base64url");
}

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.redirect(new URL("/admin?kick_error=unauthorized", BASE));
  }

  // PKCE — Kick requires code_challenge / code_verifier
  const verifier = base64url(randomBytes(32));
  const challenge = base64url(createHash("sha256").update(verifier).digest());
  const state = randomBytes(16).toString("hex");

  const cookieStore = await cookies();
  cookieStore.set("kick_streamer_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  cookieStore.set("kick_streamer_verifier", verifier, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  const redirectUri = BASE + "/api/admin/kick-streamer-auth/callback";
  return NextResponse.redirect(getStreamerAuthorizeUrl(state, challenge, redirectUri));
}
