// src/app/api/auth/passkey/login/options/route.ts
// Step 1 of passkey SIGN-IN (#544): hand the browser an authentication challenge.
// Unauthenticated by design. Usernameless / discoverable: an empty allowCredentials
// lets the browser offer any resident passkey for this site. Challenge → httpOnly cookie.
import { NextResponse } from "next/server";
import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { rateLimit } from "@/lib/rate-limit";
import { webauthnContext, AUTH_CHALLENGE_COOKIE } from "@/lib/webauthn";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const rl = await rateLimit(`pk-login-opt:${ip}`, 30, 60_000, { failClosed: false });
  if (!rl.allowed) return NextResponse.json({ error: "rate-limited" }, { status: 429 });

  const { rpID } = webauthnContext(req);
  // Sole login factor → require user verification (biometric / PIN).
  const options = await generateAuthenticationOptions({ rpID, allowCredentials: [], userVerification: "required" });
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
