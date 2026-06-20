// src/app/api/auth/passkey/login/options/route.ts
// Step 1 of passkey SIGN-IN (#544): hand the browser an authentication challenge.
// Unauthenticated by design. Usernameless / discoverable: an empty allowCredentials
// lets the browser offer any resident passkey for this site. Challenge → httpOnly cookie.
import { NextResponse } from "next/server";
import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { webauthnContext, AUTH_CHALLENGE_COOKIE } from "@/lib/webauthn";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { rpID } = webauthnContext(req);
  const options = await generateAuthenticationOptions({ rpID, allowCredentials: [], userVerification: "preferred" });
  const res = NextResponse.json(options);
  res.cookies.set(AUTH_CHALLENGE_COOKIE, options.challenge, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 300,
  });
  return res;
}
