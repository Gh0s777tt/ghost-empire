// src/app/api/profile/accent/route.ts
// Set/clear the logged-in user's profile accent preset (#546) — tints their public
// profile (avatar ring + name glow). Stores only a validated preset key (or null to
// clear); anything else is rejected.
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAccentKey } from "@/lib/profile-accents";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Musisz być zalogowany" }, { status: 401 });

  let body: { accent?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Nieprawidłowe dane" }, { status: 400 });
  }

  const raw = (body.accent ?? "").trim().toLowerCase();
  if (raw && !isAccentKey(raw)) {
    return NextResponse.json({ error: "Nieobsługiwany akcent" }, { status: 400 });
  }

  try {
    await prisma.user.update({ where: { id: session.user.id }, data: { profileAccent: raw || null } });
  } catch {
    return NextResponse.json({ ok: false, reason: "not-ready" });
  }
  return NextResponse.json({ ok: true, accent: raw || null });
}
