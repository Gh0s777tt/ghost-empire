// src/app/api/admin/schedule/route.ts
// CRUD for stream schedule slots
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/admin";
import { logAdminAction } from "@/lib/audit";

export async function POST(req: Request) {
  const auth = await requirePermission("manage_shop"); // reusing — could add own perm later
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: {
    dayOfWeek?: number;
    startHour?: number;
    startMinute?: number;
    durationMinutes?: number;
    title?: string;
    platform?: string;
  };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Nieprawidłowe dane" }, { status: 400 });
  }

  const day = Math.floor(Number(body.dayOfWeek ?? -1));
  const hour = Math.floor(Number(body.startHour ?? -1));
  const minute = Math.floor(Number(body.startMinute ?? 0));
  const duration = Math.floor(Number(body.durationMinutes ?? 180));

  if (day < 0 || day > 6) return NextResponse.json({ error: "dayOfWeek 0-6" }, { status: 400 });
  if (hour < 0 || hour > 23) return NextResponse.json({ error: "startHour 0-23" }, { status: 400 });
  if (minute < 0 || minute > 59) return NextResponse.json({ error: "startMinute 0-59" }, { status: 400 });
  if (duration < 15 || duration > 24 * 60) {
    return NextResponse.json({ error: "durationMinutes 15-1440" }, { status: 400 });
  }

  const slot = await prisma.streamScheduleSlot.create({
    data: {
      dayOfWeek: day,
      startHour: hour,
      startMinute: minute,
      durationMinutes: duration,
      title: body.title?.trim().slice(0, 200) || null,
      platform: body.platform || null,
    },
  });

  await logAdminAction({
    adminId: auth.userId,
    action: "set_user_role",
    targetType: "schedule_slot",
    targetId: slot.id,
    details: { day, hour, minute, duration, title: body.title },
    req,
  });

  return NextResponse.json({ ok: true, slot });
}

export async function PATCH(req: Request) {
  const auth = await requirePermission("manage_shop");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: {
    id?: string;
    dayOfWeek?: number;
    startHour?: number;
    startMinute?: number;
    durationMinutes?: number;
    title?: string | null;
    platform?: string | null;
    active?: boolean;
  };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Nieprawidłowe dane" }, { status: 400 });
  }
  if (!body.id) return NextResponse.json({ error: "Brak id" }, { status: 400 });

  const data: Record<string, unknown> = {};
  if (body.dayOfWeek !== undefined) data.dayOfWeek = body.dayOfWeek;
  if (body.startHour !== undefined) data.startHour = body.startHour;
  if (body.startMinute !== undefined) data.startMinute = body.startMinute;
  if (body.durationMinutes !== undefined) data.durationMinutes = body.durationMinutes;
  if (body.title !== undefined) data.title = body.title || null;
  if (body.platform !== undefined) data.platform = body.platform || null;
  if (body.active !== undefined) data.active = !!body.active;

  const slot = await prisma.streamScheduleSlot.update({
    where: { id: body.id },
    data,
  });
  return NextResponse.json({ ok: true, slot });
}

export async function DELETE(req: Request) {
  const auth = await requirePermission("manage_shop");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Brak id" }, { status: 400 });

  await prisma.streamScheduleSlot.delete({ where: { id } });

  await logAdminAction({
    adminId: auth.userId,
    action: "set_user_role",
    targetType: "schedule_slot",
    targetId: id,
    details: { deleted: true },
    req,
  });

  return NextResponse.json({ ok: true });
}
