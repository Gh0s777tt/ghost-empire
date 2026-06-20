// src/app/api/auth/passkey/register/verify/route.ts
// Step 2 of passkey registration (#543): verify the authenticator's attestation
// against the cookie-stashed challenge and store the credential. Auth-required.
// Still login-flow-agnostic — only ADDS a Passkey row.
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyRegistrationResponse } from "@simplewebauthn/server";
import type { RegistrationResponseJSON } from "@simplewebauthn/types";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { webauthnContext, REG_CHALLENGE_COOKIE, b64url } from "@/lib/webauthn";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { rpID, origin } = webauthnContext(req);
  let body: { response?: RegistrationResponseJSON; deviceName?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad-json" }, { status: 400 }); }
  if (!body.response) return NextResponse.json({ error: "no-response" }, { status: 400 });

  const expectedChallenge = (await cookies()).get(REG_CHALLENGE_COOKIE)?.value;
  if (!expectedChallenge) return NextResponse.json({ error: "challenge-expired" }, { status: 400 });

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: body.response,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: false,
    });
  } catch {
    return NextResponse.json({ error: "verify-failed" }, { status: 400 });
  }
  if (!verification.verified || !verification.registrationInfo) {
    return NextResponse.json({ error: "not-verified" }, { status: 400 });
  }

  const { credentialID, credentialPublicKey, counter } = verification.registrationInfo;
  const transports = Array.isArray(body.response.response?.transports) ? body.response.response.transports.join(",") : null;
  try {
    await prisma.passkey.create({
      data: {
        userId: session.user.id,
        credentialId: b64url.fromBuffer(credentialID),
        publicKey: b64url.fromBuffer(credentialPublicKey),
        counter,
        transports,
        deviceName: (body.deviceName ?? "").toString().trim().slice(0, 40) || null,
      },
    });
  } catch {
    // unique violation (already registered) or table missing → treat as graceful no-op
    return NextResponse.json({ ok: false, reason: "exists-or-not-ready" });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.delete(REG_CHALLENGE_COOKIE);
  return res;
}
