// src/app/api/profile/connections/link/[provider]/route.ts
// Initiates an OAuth link flow for the currently-logged-in user.
//
// 1. Verify session
// 2. Set HMAC-signed `link_intent` cookie with userId + provider
// 3. Redirect to NextAuth's signin URL — the signIn callback later reads the
//    cookie and re-routes the resulting Account to the original user.
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createLinkToken, LINK_COOKIE_NAME, linkCookieAttrs } from "@/lib/account-linking";

const ALLOWED_PROVIDERS = new Set(["twitch", "kick", "discord", "google"]);

export async function GET(
  req: Request,
  ctx: { params: Promise<{ provider: string }> },
) {
  const { provider } = await ctx.params;
  if (!ALLOWED_PROVIDERS.has(provider)) {
    return NextResponse.json({ error: "Unsupported provider" }, { status: 400 });
  }

  const session = await auth();
  if (!session?.user?.id) {
    const signInUrl = new URL("/auth/signin", req.url);
    signInUrl.searchParams.set("callbackUrl", `/api/profile/connections/link/${provider}`);
    return NextResponse.redirect(signInUrl);
  }

  // Sign the intent so the signIn callback can trust it
  const token = createLinkToken(session.user.id, provider);

  // Redirect to NextAuth sign-in for the provider, with callbackUrl back to profile
  const callbackUrl = new URL("/profile", req.url);
  callbackUrl.searchParams.set("linked", provider);

  const signinUrl = new URL(`/api/auth/signin/${provider}`, req.url);
  signinUrl.searchParams.set("callbackUrl", callbackUrl.toString());

  const res = NextResponse.redirect(signinUrl);
  res.cookies.set(LINK_COOKIE_NAME, token, linkCookieAttrs(5 * 60));
  return res;
}
