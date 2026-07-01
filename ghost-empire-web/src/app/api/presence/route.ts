// src/app/api/presence/route.ts
// Portal presence (#767). POST = heartbeat ("I'm here"): signed-in users become actor
// "u:<id>" (server-derived — the client can't impersonate), guests "a:<anonId>" (client
// id, strict hex shape check). GET = public snapshot: online count + a small sample of
// signed-in users. Dormant without Upstash Redis: both return { active: false } and the
// UI hides itself.
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { currentTenantId } from "@/lib/tenant";
import { rateLimit } from "@/lib/rate-limit";
import { cacheJson } from "@/lib/redis";
import { anonActor, userActor, presenceBeat, presenceSnapshot, PRESENCE_HEARTBEAT_MS } from "@/lib/presence";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await auth();
  let actor: string | null = null;
  if (session?.user?.id) {
    actor = userActor(session.user.id);
  } else {
    let body: { anonId?: unknown } = {};
    try { body = await req.json(); } catch { /* empty body is fine for signed-in; guests need anonId */ }
    actor = anonActor(body.anonId);
  }
  if (!actor) return NextResponse.json({ active: false }, { status: 400 });

  // Beacon fires ~every 25 s (+ visibility changes) → 10/min is generous headroom.
  const rl = await rateLimit(`presence:${actor}`, 10, 60_000, { failClosed: false });
  if (!rl.allowed) return NextResponse.json({ active: false }, { status: 429 });

  const tid = await currentTenantId();
  const online = await presenceBeat(tid, actor);
  if (online === null) return NextResponse.json({ active: false });
  return NextResponse.json({ active: true, online, nextBeatMs: PRESENCE_HEARTBEAT_MS });
}

export async function GET() {
  const tid = await currentTenantId();
  // Snapshot is shared per tenant and cheap to serve — 5 s cache flattens bursts.
  const snap = await cacheJson(`presence:snap:${tid ?? "default"}`, 5_000, () => presenceSnapshot(tid));
  if (!snap) return NextResponse.json({ active: false });
  return NextResponse.json({ active: true, online: snap.online, users: snap.users });
}
