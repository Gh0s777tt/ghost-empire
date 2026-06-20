// src/app/api/auth/passkey/register/verify/route.ts
// Step 2 of passkey registration (#543, hardened #545): verify the authenticator's
// attestation against the cookie-stashed challenge and store the credential.
// Auth-required. Login-flow-agnostic — only ADDS a Passkey row. The challenge is
// consumed (cookie cleared) on every terminal path so it can't be replayed.
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyRegistrationResponse } from "@simplewebauthn/server";
import type { RegistrationResponseJSON } from "@simplewebauthn/types";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { webauthnContext, REG_CHALLENGE_COOKIE, b64url, sanitizeTransports } from "@/lib/webauthn";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { rpID, origin } = webauthnContext(req);

  // Every terminal response clears the challenge cookie → strictly single-use.
  const done = (bodyObj: Record<string, unknown>, status = 200) => {
    const r = NextResponse.json(bodyObj, { status });
    r.cookies.delete(REG_CHALLENGE_COOKIE);
    return r;
  };

  let body: { response?: RegistrationResponseJSON; deviceName?: string };
  try { body = await req.json(); } catch { return done({ error: "bad-json" }, 400); }
  if (!body.response) return done({ error: "no-response" }, 400);

  const expectedChallenge = (await cookies()).get(REG_CHALLENGE_COOKIE)?.value;
  if (!expectedChallenge) return done({ error: "challenge-expired" }, 400);

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: body.response,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
    });
  } catch {
    return done({ error: "verify-failed" }, 400);
  }
  if (!verification.verified || !verification.registrationInfo) {
    return done({ error: "not-verified" }, 400);
  }

  const { credentialID, credentialPublicKey, counter } = verification.registrationInfo;
  try {
    await prisma.passkey.create({
      data: {
        userId: session.user.id,
        credentialId: b64url.fromBuffer(credentialID),
        publicKey: b64url.fromBuffer(credentialPublicKey),
        counter,
        transports: sanitizeTransports(body.response.response?.transports),
        deviceName: (body.deviceName ?? "").toString().trim().slice(0, 40) || null,
      },
    });
  } catch {
    // unique violation (already registered) or table missing → graceful
    return done({ ok: false, reason: "exists-or-not-ready" });
  }

  return done({ ok: true });
}
