// src/app/api/auth/donationalerts/route.ts
// Start the DonationAlerts OAuth flow — admin only (#donation-layer).
//
// THE REDIRECT URI IS DERIVED FROM THE REQUEST HOST, not from `NEXTAUTH_URL`. That is load-bearing
// for white-label, and getting it wrong makes the flow impossible to complete on any portal but one:
// production deliberately leaves `NEXTAUTH_URL` UNSET when portals run on their own domains (see
// docs/ENV.md — setting it pins every OAuth callback to a single host). A module-level constant would
// therefore send the streamer of `empire-forge.com` to a callback on a DIFFERENT host, where the
// `httpOnly` nonce cookie this route just set does not exist — so the CSRF check would fail every
// time, for every portal except whichever one happens to be that host.
//
// Deriving from the request means the start route, the cookie, and the callback are all on the SAME
// origin, and both ends compute the identical `redirect_uri` string independently — which is exactly
// what the vendor requires at token exchange. The cost is that each portal's callback URL must be
// registered in the DonationAlerts application (see docs/OWNER-SETUP.md §9).
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireAdmin } from "@/lib/admin";
import { signOAuthState } from "@/lib/oauth-state";
import { currentTenantId } from "@/lib/tenant";
import { daAuthorizeUrl } from "@/lib/donations/donationalerts";

/**
 * The origin the caller actually reached us on.
 *
 * @remarks
 * Host is the same signal `currentTenantId()` trusts to resolve the portal, so this introduces no
 * new trust: a forged Host produces a `redirect_uri` the vendor rejects (it is not registered in the
 * app), rather than a usable open redirect. `https` is forced because the vendor requires it and the
 * cookie below is `secure`.
 */
export function originOf(req: Request): string {
  const host = req.headers.get("host");
  if (host) return `https://${host}`;
  return process.env.NEXTAUTH_URL ?? "https://ghost-empire-web.vercel.app";
}

/** The exact `redirect_uri` for THIS request's portal — computed identically by the callback. */
export function daRedirectUri(req: Request): string {
  return `${originOf(req)}/api/auth/donationalerts/callback`;
}

/** True when the platform-level OAuth app credentials exist; the panel reads the same condition. */
export function daConfigured(): boolean {
  return Boolean(process.env.DONATIONALERTS_CLIENT_ID && process.env.DONATIONALERTS_CLIENT_SECRET);
}

export async function GET(req: Request) {
  const base = originOf(req);
  const back = (q: string) => NextResponse.redirect(new URL(`/admin?${q}`, base));

  const auth = await requireAdmin();
  if (!auth.ok) return back("da_error=unauthorized");

  // Fail loudly rather than bouncing the streamer to a vendor error page: without the app
  // credentials the flow cannot complete, and a blank client_id looks like a vendor outage.
  if (!daConfigured()) return back("da_error=not_configured");

  const { state, nonce } = signOAuthState({
    tenantId: await currentTenantId(),
    userId: auth.userId,
    provider: "donationalerts",
  });

  const cookieStore = await cookies();
  cookieStore.set("da_oauth_state", nonce, {
    httpOnly: true,
    secure: true,
    sameSite: "lax", // the vendor redirect is a top-level GET, so lax still sends it
    maxAge: 600, // 10 min — long enough to authorize, short enough not to linger
    path: "/",
  });

  return NextResponse.redirect(daAuthorizeUrl(state, daRedirectUri(req)));
}
