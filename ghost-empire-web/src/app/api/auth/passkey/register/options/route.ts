// src/app/api/auth/passkey/register/options/route.ts
// Step 1 of passkey registration (#543): hand the browser a challenge + parameters.
// Auth-required (you register a passkey for your already-signed-in account). The
// challenge is stashed in a short-lived httpOnly cookie for the verify step. This
// route does NOT touch the login flow — it only ever ADDS a credential.
import { NextResponse } from "next/server";
import { generateRegistrationOptions } from "@simplewebauthn/server";
import type { AuthenticatorTransportFuture } from "@simplewebauthn/types";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { webauthnContext, RP_NAME, REG_CHALLENGE_COOKIE, b64url } from "@/lib/webauthn";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { rpID } = webauthnContext(req);
  const [user, existing] = await Promise.all([
    prisma.user.findUnique({ where: { id: session.user.id }, select: { username: true, displayName: true } }).catch(() => null),
    prisma.passkey.findMany({ where: { userId: session.user.id }, select: { credentialId: true, transports: true } }).catch(() => []),
  ]);

  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID,
    userID: session.user.id,
    userName: user?.username ?? session.user.id,
    userDisplayName: user?.displayName ?? user?.username ?? "GH0ST",
    attestationType: "none",
    // Don't let the same authenticator register twice.
    excludeCredentials: existing.map((p) => ({
      id: b64url.toBuffer(p.credentialId),
      type: "public-key" as const,
      transports: (p.transports ? p.transports.split(",") : undefined) as AuthenticatorTransportFuture[] | undefined,
    })),
    authenticatorSelection: { residentKey: "preferred", userVerification: "preferred" },
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
