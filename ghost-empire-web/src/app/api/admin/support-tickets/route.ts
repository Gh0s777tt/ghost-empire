// src/app/api/admin/support-tickets/route.ts
// Admin side of viewer support tickets (#audit5, part 2): the portal owner lists tickets,
// replies, resolves/reopens. Strictly tenant-scoped (a tenant admin only sees/touches their
// own portal's tickets) and the viewer is notified on every reply/resolve. The viewer side
// (open + own-list) lives in /api/profile/tickets.
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { logAdminAction } from "@/lib/audit";
import { currentTenantId } from "@/lib/tenant";

export const dynamic = "force-dynamic";

// GET ?status=open|resolved|all (default open) — the portal's tickets + submitter info.
export async function GET(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const tid = await currentTenantId();
  const statusParam = new URL(req.url).searchParams.get("status") ?? "open";
  const statusFilter = statusParam === "open" || statusParam === "resolved" ? { status: statusParam } : {};

  const tickets = await prisma.supportTicket.findMany({
    where: { ...(tid ? { tenantId: tid } : {}), ...statusFilter },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 200,
    select: {
      id: true, subject: true, message: true, category: true, status: true, adminReply: true,
      createdAt: true, resolvedAt: true,
      user: { select: { id: true, username: true, displayName: true, image: true } },
    },
  });

  const openCount = await prisma.supportTicket.count({ where: { ...(tid ? { tenantId: tid } : {}), status: "open" } });

  return NextResponse.json({
    openCount,
    tickets: tickets.map((t) => ({
      id: t.id,
      subject: t.subject,
      message: t.message,
      category: t.category,
      status: t.status,
      adminReply: t.adminReply,
      createdAt: t.createdAt.toISOString(),
      resolvedAt: t.resolvedAt?.toISOString() ?? null,
      user: { id: t.user.id, username: t.user.username, displayName: t.user.displayName, image: t.user.image },
    })),
  });
}

// PATCH { ticketId, action: "reply" | "resolve" | "reopen", reply? }
export async function PATCH(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: { ticketId?: string; action?: string; reply?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Nieprawidłowe dane" }, { status: 400 }); }
  if (!body.ticketId) return NextResponse.json({ error: "Brak ticketId" }, { status: 400 });

  // Tenant isolation: a tenant admin must only touch their own portal's tickets
  // (null = legacy/founder, allowed for the null/founder tenant). Mirrors the donations gate.
  const tid = await currentTenantId();
  const ticket = await prisma.supportTicket.findUnique({
    where: { id: body.ticketId },
    select: { id: true, userId: true, tenantId: true, subject: true },
  });
  if (!ticket || (tid && ticket.tenantId !== tid)) return NextResponse.json({ error: "Zgłoszenie nie istnieje" }, { status: 404 });

  const notifyViewer = (title: string, message: string) =>
    prisma.notification
      .create({ data: { userId: ticket.userId, type: "system", title, message, icon: "🎫", link: "/profile" } })
      .catch(() => {});

  if (body.action === "reply") {
    const reply = (body.reply ?? "").trim().slice(0, 2000);
    if (reply.length < 1) return NextResponse.json({ error: "Pusta odpowiedź" }, { status: 400 });
    await prisma.supportTicket.update({ where: { id: ticket.id }, data: { adminReply: reply } });
    await notifyViewer("✉️ Odpowiedź na Twoje zgłoszenie", ticket.subject);
    await logAdminAction({ adminId: auth.userId, action: "respond_ticket", targetType: "support_ticket", targetId: ticket.id, details: { kind: "reply" }, req });
    return NextResponse.json({ ok: true, action: "reply" });
  }

  if (body.action === "resolve") {
    const data: { status: string; resolvedAt: Date; adminReply?: string } = { status: "resolved", resolvedAt: new Date() };
    const reply = (body.reply ?? "").trim().slice(0, 2000);
    if (reply.length >= 1) data.adminReply = reply; // optional closing note
    await prisma.supportTicket.update({ where: { id: ticket.id }, data });
    await notifyViewer("✅ Twoje zgłoszenie zostało rozwiązane", ticket.subject);
    await logAdminAction({ adminId: auth.userId, action: "respond_ticket", targetType: "support_ticket", targetId: ticket.id, details: { kind: "resolve" }, req });
    return NextResponse.json({ ok: true, action: "resolve" });
  }

  if (body.action === "reopen") {
    await prisma.supportTicket.update({ where: { id: ticket.id }, data: { status: "open", resolvedAt: null } });
    await logAdminAction({ adminId: auth.userId, action: "respond_ticket", targetType: "support_ticket", targetId: ticket.id, details: { kind: "reopen" }, req });
    return NextResponse.json({ ok: true, action: "reopen" });
  }

  return NextResponse.json({ error: "action: reply | resolve | reopen" }, { status: 400 });
}
