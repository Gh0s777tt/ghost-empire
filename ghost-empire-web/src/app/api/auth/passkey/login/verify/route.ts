// src/app/api/auth/passkey/login/verify/route.ts
// Step 2 of passkey SIGN-IN (#544, hardened #545): verify the assertion and mint a session.
//
// Database-session strategy means we can't go through NextAuth's Credentials flow
// (that's JWT-only). Instead we replicate EXACTLY what NextAuth's adapter does on a
// successful database sign-in: create a Session row and set the host-only authjs
// session cookie to that raw sessionToken. rpID/origin (and therefore the cookie
// name/secure) are pinned to the canonical URL, not the request headers, so this can't
// be steered by a spoofed Host. This adds a NEW session for THIS browser only — it
// never alters the NextAuth config, the OAuth providers, or any other user's
// session. Worst case is "didn't sign in," never "broke OAuth."
//
// Because it is a SECOND sign-in path, every gate NextAuth applies must be repeated here or
// it is simply absent: that is how the site ban was bypassed (see the isBanActive() check
// below). The one thing borrowed from lib/auth.ts is that pure predicate — no config, no
// provider, no session read — precisely so the two paths share one definition of "banned".
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import type { AuthenticationResponseJSON, AuthenticatorTransportFuture } from "@simplewebauthn/server";
import { prisma } from "@/lib/prisma";
import { isBanActive } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { webauthnContext, AUTH_CHALLENGE_COOKIE, b64url, isSecureContext } from "@/lib/webauthn";
import { clientIp } from "@/lib/http";

export const dynamic = "force-dynamic";

const SESSION_DAYS = 30;

export async function POST(req: Request) {
  const ip = clientIp(req);
  const rl = await rateLimit(`pk-login:${ip}`, 20, 60_000, { failClosed: false });
  if (!rl.allowed) return NextResponse.json({ error: "rate-limited" }, { status: 429 });

  const { rpID, origin } = webauthnContext(req);

  // Every terminal response clears the challenge cookie → the challenge is strictly
  // single-use (no replay within the TTL, even on a failed attempt).
  const done = (bodyObj: Record<string, unknown>, status = 200) => {
    const r = NextResponse.json(bodyObj, { status });
    r.cookies.delete(AUTH_CHALLENGE_COOKIE);
    return r;
  };

  let body: { response?: AuthenticationResponseJSON };
  try { body = await req.json(); } catch { return done({ error: "bad-json" }, 400); }
  const resp = body.response;
  if (!resp?.id) return done({ error: "no-response" }, 400);

  const expectedChallenge = (await cookies()).get(AUTH_CHALLENGE_COOKIE)?.value;
  if (!expectedChallenge) return done({ error: "challenge-expired" }, 400);

  const pk = await prisma.passkey.findUnique({ where: { credentialId: resp.id } }).catch(() => null);
  // Generic "not-verified" whether the credential is unknown OR the signature fails —
  // never reveal which credential IDs exist (enumeration oracle).
  if (!pk) return done({ error: "not-verified" }, 400);

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response: resp,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      // v13: `credential` (was `authenticator`) — `id` is the stored base64url string (matches
      // resp.id), `publicKey` is a Uint8Array decoded from the stored base64url.
      credential: {
        id: pk.credentialId,
        publicKey: b64url.toBuffer(pk.publicKey),
        counter: pk.counter,
        transports: (pk.transports ? pk.transports.split(",") : undefined) as AuthenticatorTransportFuture[] | undefined,
      },
      // Sole login factor → require user verification (biometric / PIN), not mere presence.
      requireUserVerification: true,
    });
  } catch {
    return done({ error: "not-verified" }, 400);
  }
  if (!verification.verified) return done({ error: "not-verified" }, 400);

  // Clone detection: a non-zero counter that fails to advance signals a duplicated
  // authenticator — refuse the login (counter 0 means the authenticator doesn't use one).
  const newCounter = verification.authenticationInfo.newCounter;
  if (newCounter !== 0 && newCounter <= pk.counter) {
    return done({ error: "not-verified" }, 400);
  }

  // Advance the signature counter + stamp last use. Best-effort.
  await prisma.passkey
    .update({ where: { id: pk.id }, data: { counter: newCounter, lastUsedAt: new Date() } })
    .catch(() => {});

  // SITE BAN — checked BEFORE any session exists. [audit fix] This route replicates the DB
  // sign-in independently of NextAuth, and it used to skip the ban gate entirely: banning a
  // user sets isBanned, deletes their Session rows and blocks OAuth re-login (the signIn
  // callback in lib/auth.ts), but ANY banned user who had registered a passkey simply signed
  // back in here with full economy access. The verdict comes from the SHARED isBanActive()
  // helper — the same predicate the signIn callback uses, including "an expired bannedUntil
  // auto-unbans" — so the two sign-in paths can never drift apart. A failed lookup rejects
  // (fail closed): no user row ⇒ no session.
  const user = await prisma.user
    .findUnique({ where: { id: pk.userId }, select: { id: true, isBanned: true, bannedUntil: true } })
    .catch(() => null);
  if (!user) return done({ error: "not-verified" }, 400);
  if (user.isBanned) {
    // Deliberately the same generic "not-verified" as every other refusal above: the response
    // must not become an oracle telling a probing client whether an account is banned.
    if (isBanActive(user)) return done({ error: "not-verified" }, 400);
    // Ban czasowy już wygasł → zdejmujemy go dokładnie jak signIn callback (best-effort:
    // przeterminowany ban i tak nie blokuje, więc nieudany zapis nie może wywalić logowania).
    await prisma.user
      .update({ where: { id: user.id }, data: { isBanned: false, bannedUntil: null, banReason: null } })
      .catch(() => {});
  }

  // Mint the database session exactly like NextAuth's DB sign-in (cookie name/secure
  // pinned to the canonical origin, matching @auth/core).
  const secure = isSecureContext(origin);
  const cookieName = `${secure ? "__Secure-" : ""}authjs.session-token`;
  const sessionToken = randomUUID();
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  try {
    await prisma.session.create({ data: { sessionToken, userId: pk.userId, expires } });
  } catch {
    return done({ error: "session-failed" }, 500);
  }

  const res = done({ ok: true });
  res.cookies.set(cookieName, sessionToken, { httpOnly: true, sameSite: "lax", path: "/", secure, expires });
  return res;
}
