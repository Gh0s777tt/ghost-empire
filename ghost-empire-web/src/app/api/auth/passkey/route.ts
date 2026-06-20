// src/app/api/auth/passkey/route.ts
// List + remove the signed-in user's passkeys (#543). Scoped to the caller's userId.
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const passkeys = await prisma.passkey
    .findMany({
      where: { userId: session.user.id },
      select: { id: true, deviceName: true, createdAt: true, lastUsedAt: true },
      orderBy: { createdAt: "desc" },
    })
    .catch(() => []);
  return NextResponse.json({ passkeys });
}

export async function DELETE(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "no-id" }, { status: 400 });
  await prisma.passkey.deleteMany({ where: { id, userId: session.user.id } }).catch(() => {});
  return NextResponse.json({ ok: true });
}
