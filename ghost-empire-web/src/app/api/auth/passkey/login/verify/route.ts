// src/app/api/auth/passkey/login/verify/route.ts
// Step 2 of passkey SIGN-IN (#544): verify the assertion and mint a session.
//
// Database-session strategy means we can't go through NextAuth's Credentials flow
// (that's JWT-only). Instead we replicate EXACTLY what NextAuth's adapter does on a
// successful database sign-in: create a Session row and set the host-only authjs
// session cookie to that raw sessionToken. This adds a NEW session for THIS browser
// only — it never reads or alters the NextAuth config, the OAuth providers, or any
// other user's session. Worst case (e.g. a mismatched cookie) is "didn't sign in",
// never "broke OAuth".
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import type { AuthenticationResponseJSON, AuthenticatorTransportFuture } from "@simplewebauthn/types";
import { prisma } from "@/lib/prisma";
import { webauthnContext, AUTH_CHALLENGE_COOKIE, b64url } from "@/lib/webauthn";

export const dynamic = "force-dynamic";

const SESSION_DAYS = 30;

export async function POST(req: Request) {
  const { rpID, origin } = webauthnContext(req);

  let body: { response?: AuthenticationResponseJSON };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad-json" }, { status: 400 }); }
  const resp = body.response;
  if (!resp?.id) return NextResponse.json({ error: "no-response" }, { status: 400 });

  const expectedChallenge = (await cookies()).get(AUTH_CHALLENGE_COOKIE)?.value;
  if (!expectedChallenge) return NextResponse.json({ error: "challenge-expired" }, { status: 400 });

  const pk = await prisma.passkey.findUnique({ where: { credentialId: resp.id } }).catch(() => null);
  if (!pk) return NextResponse.json({ error: "unknown-credential" }, { status: 400 });

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response: resp,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      authenticator: {
        credentialID: b64url.toBuffer(pk.credentialId),
        credentialPublicKey: b64url.toBuffer(pk.publicKey),
        counter: pk.counter,
        transports: (pk.transports ? pk.transports.split(",") : undefined) as AuthenticatorTransportFuture[] | undefined,
      },
      requireUserVerification: false,
    });
  } catch {
    return NextResponse.json({ error: "verify-failed" }, { status: 400 });
  }
  if (!verification.verified) return NextResponse.json({ error: "not-verified" }, { status: 400 });

  // Advance the signature counter (clone detection) + stamp last use. Best-effort.
  await prisma.passkey
    .update({ where: { id: pk.id }, data: { counter: verification.authenticationInfo.newCounter, lastUsedAt: new Date() } })
    .catch(() => {});

  // Mint the database session exactly like NextAuth's DB sign-in.
  const secure = origin.startsWith("https");
  const cookieName = `${secure ? "__Secure-" : ""}authjs.session-token`;
  const sessionToken = randomUUID();
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  try {
    await prisma.session.create({ data: { sessionToken, userId: pk.userId, expires } });
  } catch {
    return NextResponse.json({ error: "session-failed" }, { status: 500 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(cookieName, sessionToken, { httpOnly: true, sameSite: "lax", path: "/", secure, expires });
  res.cookies.delete(AUTH_CHALLENGE_COOKIE);
  return res;
}
