// src/app/api/push/test/route.ts
// Sends a test push to the caller's OWN devices (#533) so the streamer can verify the
// whole loop once VAPID + the db push are live. Title/body come from the client (it
// already has the i18n strings); buildPushPayload clamps them. Self-only — you can
// only ever notify your own subscriptions.
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isPushConfigured, sendPushToUser } from "@/lib/web-push";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isPushConfigured()) return NextResponse.json({ ok: false, reason: "not-configured" });

  let body: { title?: string; body?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* empty body is fine — fall back to defaults below */
  }

  const res = await sendPushToUser(session.user.id, {
    title: body.title || "GH0ST EMPIRE",
    body: body.body || "Test ✅",
    url: "/",
  });
  return NextResponse.json({ ok: true, ...res });
}
