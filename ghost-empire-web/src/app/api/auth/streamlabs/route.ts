// src/app/api/auth/streamlabs/route.ts
// Initiate Streamlabs OAuth — admin-only. Redirects user to Streamlabs to authorize.
import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { requireAdmin } from "@/lib/admin";
import { getAuthorizeUrl } from "@/lib/streamlabs";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.redirect(new URL("/admin?streamlabs_error=unauthorized",
      process.env.NEXTAUTH_URL ?? "https://ghost-empire-web.vercel.app"));
  }

  // Generate CSRF state, store in cookie for callback validation
  const state = randomBytes(32).toString("hex");
  const cookieStore = await cookies();
  cookieStore.set("streamlabs_oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 600, // 10 min
    path: "/",
  });

  return NextResponse.redirect(getAuthorizeUrl(state));
}
