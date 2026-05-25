// src/app/api/admin/drops/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin";
import { logAdminAction } from "@/lib/audit";

function generateCode(): string {
  // 6 chars, uppercase alphanumeric (skipping ambiguous 0/O/I/1)
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 6; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: {
    code?: string;
    reward?: number;
    bonusReward?: number;
    bonusSlots?: number;
    expiresInMinutes?: number;
  };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Nieprawidłowe dane" }, { status: 400 });
  }

  const reward = Math.floor(Number(body.reward ?? 0));
  const bonusReward = Math.floor(Number(body.bonusReward ?? 0));
  const bonusSlots = Math.floor(Number(body.bonusSlots ?? 10));
  const expiresInMinutes = Math.floor(Number(body.expiresInMinutes ?? 0));

  if (!Number.isFinite(reward) || reward < 1 || reward > 100_000) {
    return NextResponse.json({ error: "Reward musi być 1-100,000" }, { status: 400 });
  }
  if (bonusReward < 0 || bonusReward > 100_000) {
    return NextResponse.json({ error: "Bonus reward 0-100,000" }, { status: 400 });
  }
  if (bonusSlots < 0 || bonusSlots > 1000) {
    return NextResponse.json({ error: "Bonus slots 0-1000" }, { status: 400 });
  }

  let code = body.code?.trim().toUpperCase().slice(0, 24) ?? "";
  if (code && !/^[A-Z0-9_-]{3,24}$/.test(code)) {
    return NextResponse.json(
      { error: "Code: 3-24 znaków A-Z, 0-9, _, -" },
      { status: 400 },
    );
  }

  // Auto-generate if empty, retry on collision (rare for 6 chars from 32-char alphabet)
  if (!code) {
    for (let i = 0; i < 5; i++) {
      const candidate = generateCode();
      const exists = await prisma.streamDrop.findUnique({ where: { code: candidate } });
      if (!exists) { code = candidate; break; }
    }
    if (!code) {
      return NextResponse.json({ error: "Nie udało się wygenerować kodu" }, { status: 500 });
    }
  } else {
    const exists = await prisma.streamDrop.findUnique({ where: { code } });
    if (exists) {
      return NextResponse.json({ error: `Code "${code}" już istnieje` }, { status: 409 });
    }
  }

  const expiresAt = expiresInMinutes > 0
    ? new Date(Date.now() + expiresInMinutes * 60_000)
    : null;

  const drop = await prisma.streamDrop.create({
    data: {
      code,
      reward,
      bonusReward,
      bonusSlots,
      expiresAt,
      createdById: auth.userId,
    },
  });

  await logAdminAction({
    adminId: auth.userId,
    action: "create_drop",
    targetType: "drop",
    targetId: drop.id,
    details: { code: drop.code, reward: drop.reward, bonusReward: drop.bonusReward, bonusSlots: drop.bonusSlots, expiresAt: drop.expiresAt },
    req,
  });

  return NextResponse.json({ ok: true, drop });
}

export async function DELETE(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Brak id" }, { status: 400 });

  await prisma.streamDrop.update({
    where: { id },
    data: { active: false },
  });

  await logAdminAction({
    adminId: auth.userId,
    action: "deactivate_drop",
    targetType: "drop",
    targetId: id,
    req,
  });

  return NextResponse.json({ ok: true });
}
