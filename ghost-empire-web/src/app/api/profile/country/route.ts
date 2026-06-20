// src/app/api/profile/country/route.ts
// Set/clear the logged-in user's country (#540) — drives the flag on their profile.
// Stores only a validated ISO-2 code (or null to clear); anything else is rejected.
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isCountryCode } from "@/lib/countries";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Musisz być zalogowany" }, { status: 401 });

  let body: { country?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Nieprawidłowe dane" }, { status: 400 });
  }

  const raw = (body.country ?? "").trim().toUpperCase();
  if (raw && !isCountryCode(raw)) {
    return NextResponse.json({ error: "Nieobsługiwany kraj" }, { status: 400 });
  }

  try {
    await prisma.user.update({ where: { id: session.user.id }, data: { country: raw || null } });
  } catch {
    return NextResponse.json({ ok: false, reason: "not-ready" });
  }
  return NextResponse.json({ ok: true, country: raw || null });
}
