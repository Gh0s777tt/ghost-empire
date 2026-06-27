// src/app/api/push/test/route.ts
// Sends a test push to the caller's OWN devices (#533) so the streamer can verify the
// whole loop once VAPID + the db push are live. Title/body come from the client (it
// already has the i18n strings); buildPushPayload clamps them. Self-only — you can
// only ever notify your own subscriptions.
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getCurrentTenant } from "@/lib/tenant";
import { isPushConfigured, sendPushToUser } from "@/lib/web-push";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isPushConfigured()) return NextResponse.json({ ok: false, reason: "not-configured" });

  // Each send fans out to the user's devices + the external push provider — cap it so a
  // tight loop can't spam them (or run up provider cost). #audit-v2
  const rl = await rateLimit(`push:test:${session.user.id}`, 5, 60_000);
  if (!rl.allowed) return NextResponse.json({ ok: false, reason: "rate-limited" }, { status: 429, headers: rateLimitHeaders(rl) });

  let body: { title?: string; body?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* empty body is fine — fall back to defaults below */
  }

  // Fallback title is the active portal's brand (not the hardcoded founder), in case the
  // client didn't send its i18n title.
  const res = await sendPushToUser(session.user.id, {
    title: body.title || (await getCurrentTenant()).name,
    body: body.body || "Test ✅",
    url: "/",
  });
  return NextResponse.json({ ok: true, ...res });
}
