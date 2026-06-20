// src/app/api/push/unsubscribe/route.ts
// Removes a browser's push subscription for the logged-in user (#533). Scoped to the
// caller's userId so one user can't delete another's endpoint.
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { endpoint?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad-json" }, { status: 400 });
  }
  if (!body.endpoint) return NextResponse.json({ error: "no-endpoint" }, { status: 400 });

  try {
    await prisma.pushSubscription.deleteMany({ where: { endpoint: body.endpoint, userId: session.user.id } });
  } catch {
    /* table not migrated — nothing to remove */
  }
  return NextResponse.json({ ok: true });
}
