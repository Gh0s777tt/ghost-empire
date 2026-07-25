// src/app/api/auth/donationalerts/callback/route.ts
// DonationAlerts OAuth callback — exchanges the code and stores the grant (#donation-layer).
//
// The grant is stored on the portal's existing `DonationIntegration` row rather than in a new model:
// that table already carries `tokenEnc` / `secretEnc` / `externalRef` / `lastEventAt`, which is
// exactly an OAuth connection plus a poll cursor. Reusing it means NO schema change — so this ships
// without a db push and without the deploy-ordering hazard a new column brings.
//
// TRUST: this is the only inbound provider stamped `verified`, and the reason is narrow — the
// donations are read by US, over TLS, with a credential the streamer granted us, from the vendor's
// own API. That chain establishes authenticity; a shared webhook secret or a public widget id does
// not. The stamp is applied in the CRON, not here (nothing is ingested during the callback).
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { encryptSecret } from "@/lib/crypto";
import { verifyOAuthState } from "@/lib/oauth-state";
import { logAdminAction } from "@/lib/audit";
import * as Sentry from "@sentry/nextjs";
import { createLogger } from "@/lib/logger";
import { daExchangeToken } from "@/lib/donations/donationalerts";
import { daRedirectUri, originOf } from "../route";

const log = createLogger("donationalerts");

export async function GET(req: Request) {
  // Same origin the start route used — the vendor sent the browser to the URI that route built, so
  // this recomputes the identical string for the exchange and lands the streamer back on THEIR portal.
  const base = originOf(req);
  const back = (q: string) => NextResponse.redirect(new URL(`/admin?${q}`, base));

  const auth = await requireAdmin();
  if (!auth.ok) return back("da_error=unauthorized");

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const vendorError = url.searchParams.get("error");
  if (vendorError) return back(`da_error=${encodeURIComponent(vendorError)}`);
  if (!code) return back("da_error=no_code");

  // Signed state → {tenantId, userId}; the cookie nonce pins it to this browser. A MISSING cookie
  // must fail, not skip the bind — otherwise the CSRF check is optional for any caller who can
  // suppress it.
  const payload = verifyOAuthState(url.searchParams.get("state"), "donationalerts");
  if (!payload) return back("da_error=state_mismatch");
  const cookieStore = await cookies();
  const cookieNonce = cookieStore.get("da_oauth_state")?.value;
  if (!cookieNonce || cookieNonce !== payload.nonce) return back("da_error=state_mismatch");
  cookieStore.delete("da_oauth_state");

  let token;
  try {
    token = await daExchangeToken({ code, redirectUri: daRedirectUri(req) });
  } catch (e) {
    log.error("token exchange failed", e);
    Sentry.captureException(e, { tags: { flow: "donationalerts-connect" } });
    return back("da_error=token_exchange");
  }

  // Without a refresh token the connection dies silently at the first expiry, so refuse to store a
  // grant we cannot renew — better a clear error now than a rail that stops days later.
  if (!token.refresh_token) {
    log.error("no refresh token in grant", undefined, { tenantId: payload.tenantId });
    return back("da_error=no_refresh_token");
  }

  const tid = payload.tenantId;
  // requireAdmin() authorises against the tenant resolved from THIS host. The grant, however, is
  // written to the tenant captured when the flow started. Assert they are the same identity rather
  // than assuming: the signed state proves an admin started it, and this proves the same admin
  // finished it, so a state minted on one portal cannot be completed into another.
  if (payload.userId !== auth.userId) {
    log.error("state/session user mismatch", undefined, { tenantId: tid });
    return back("da_error=state_mismatch");
  }

  try {
    // findFirst, not the (tenantId, provider) compound unique: Postgres treats NULLs as distinct,
    // so the founder row (tenantId = null) is not addressable through that unique.
    const existing = await prisma.donationIntegration.findFirst({
      where: { tenantId: tid ?? null, provider: "donationalerts" },
      select: { id: true },
    });
    const data = {
      enabled: true,
      trust: "verified",
      tokenEnc: encryptSecret(token.access_token),
      secretEnc: encryptSecret(token.refresh_token),
      lastError: null,
    };
    if (existing) {
      await prisma.donationIntegration.update({ where: { id: existing.id }, data });
    } else {
      await prisma.donationIntegration.create({
        data: { tenantId: tid ?? null, provider: "donationalerts", ...data },
      });
    }
  } catch (e) {
    log.error("storing the grant failed", e);
    Sentry.captureException(e, { tags: { flow: "donationalerts-connect" } });
    return back("da_error=store_failed");
  }

  // The audit row records THAT a grant was connected — never the token.
  await logAdminAction({
    adminId: auth.userId,
    action: "connect_donationalerts",
    targetType: "donation_integration",
    details: { tenantId: tid ?? null },
  }).catch(() => {});

  return back("da_ok=1");
}
