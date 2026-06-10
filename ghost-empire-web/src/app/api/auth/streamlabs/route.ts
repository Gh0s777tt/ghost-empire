// src/app/api/auth/streamlabs/route.ts
// Initiate Streamlabs OAuth — admin-only. Redirects user to Streamlabs to authorize.
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireAdmin } from "@/lib/admin";
import { getAuthorizeUrl } from "@/lib/streamlabs";
import { signOAuthState } from "@/lib/oauth-state";
import { currentTenantId } from "@/lib/tenant";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.redirect(new URL("/admin?streamlabs_error=unauthorized",
      process.env.NEXTAUTH_URL ?? "https://ghost-empire-web.vercel.app"));
  }

  // Signed state carries {tenantId, userId} (shared OAuth app → one callback URL);
  // the nonce mirrors into the cookie for same-host CSRF matching.
  const { state, nonce } = signOAuthState({
    tenantId: await currentTenantId(),
    userId: auth.userId,
    provider: "streamlabs",
  });
  const cookieStore = await cookies();
  cookieStore.set("streamlabs_oauth_state", nonce, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 600, // 10 min
    path: "/",
  });

  return NextResponse.redirect(getAuthorizeUrl(state));
}
