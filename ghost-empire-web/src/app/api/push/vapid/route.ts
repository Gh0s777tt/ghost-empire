// src/app/api/push/vapid/route.ts
// Serves the VAPID public key to the client so it can subscribe. Read at runtime
// (not a NEXT_PUBLIC build-time inline) so adding the key activates push with no
// rebuild. Returns { key: null } when push isn't configured → the client hides the
// toggle (dormant). The public key is, by design, public.
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ key: process.env.VAPID_PUBLIC_KEY ?? null });
}
