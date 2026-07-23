// src/app/api/auth/passkey/register/options/route.ts
// Step 1 of passkey registration (#543): hand the browser a challenge + parameters.
// Auth-required (you register a passkey for your already-signed-in account). The
// challenge is stashed in a short-lived httpOnly cookie for the verify step. This
// route does NOT touch the login flow — it only ever ADDS a credential.
import { NextResponse } from "next/server";
import { generateRegistrationOptions } from "@simplewebauthn/server";
import type { AuthenticatorTransportFuture } from "@simplewebauthn/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { webauthnContext, RP_NAME, REG_CHALLENGE_COOKIE } from "@/lib/webauthn";
import { getCurrentTenant } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { rpID } = webauthnContext(req);
  const [user, existing] = await Promise.all([
    prisma.user.findUnique({ where: { id: session.user.id }, select: { username: true, displayName: true } }).catch(() => null),
    prisma.passkey.findMany({ where: { userId: session.user.id }, select: { credentialId: true, transports: true } }).catch(() => []),
  ]);

  // White-label: the OS "Save a passkey for …" dialog shows THIS portal's brand, not the founder's.
  const { name } = await getCurrentTenant();
  const options = await generateRegistrationOptions({
    rpName: name || RP_NAME,
    rpID,
    // v13: userID is a Uint8Array (was a string in v9).
    userID: new TextEncoder().encode(session.user.id),
    userName: user?.username ?? session.user.id,
    userDisplayName: user?.displayName ?? user?.username ?? "GH0ST",
    attestationType: "none",
    // Don't let the same authenticator register twice. v13: `id` is the base64url string
    // (was a Buffer in v9) and the `type` field was dropped.
    excludeCredentials: existing.map((p) => ({
      id: p.credentialId,
      transports: (p.transports ? p.transports.split(",") : undefined) as AuthenticatorTransportFuture[] | undefined,
    })),
    authenticatorSelection: { residentKey: "preferred", userVerification: "required" },
  });

  const res = NextResponse.json(options);
  res.cookies.set(REG_CHALLENGE_COOKIE, options.challenge, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 300,
  });
  return res;
}
