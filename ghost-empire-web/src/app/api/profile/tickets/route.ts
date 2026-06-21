// src/app/api/profile/tickets/route.ts
// Viewer support tickets (#audit5): a logged-in viewer opens a ticket to the streamer (e.g. a
// physical-reward delivery issue, a bug, a question) and sees their own tickets + replies.
// Strictly scoped to session.user.id; the portal owner is notified on a new ticket. Admin-side
// reply/resolve lives in /api/admin/support-tickets.
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { jsonError } from "@/lib/api-i18n";
import { prisma } from "@/lib/prisma";
import { currentTenantId } from "@/lib/tenant";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// Allowed ticket categories (triage). Anything else falls back to "other".
const CATEGORIES = new Set(["reward", "bug", "question", "other"]);

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return jsonError("Musisz być zalogowany", 401);
  const tickets = await prisma.supportTicket.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { id: true, subject: true, message: true, category: true, status: true, adminReply: true, createdAt: true, resolvedAt: true },
  });
  return NextResponse.json({
    tickets: tickets.map((t) => ({ ...t, createdAt: t.createdAt.toISOString(), resolvedAt: t.resolvedAt?.toISOString() ?? null })),
  });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return jsonError("Musisz być zalogowany", 401);
  const userId = session.user.id;
  const rl = await rateLimit(`ticket:${userId}`, 5, 60 * 60_000); // 5 / hour
  if (!rl.allowed) return jsonError("Za dużo zgłoszeń. Spróbuj później.", 429);

  let body: { subject?: string; message?: string; category?: string };
  try { body = (await req.json()) as { subject?: string; message?: string; category?: string }; } catch { return jsonError("Nieprawidłowe dane", 400); }
  const subject = (body.subject ?? "").trim().slice(0, 120);
  const message = (body.message ?? "").trim().slice(0, 2000);
  const category = CATEGORIES.has(body.category ?? "") ? body.category! : "other";
  if (subject.length < 3 || message.length < 5) return jsonError("Podaj temat i treść zgłoszenia", 400);

  // Anti-flood: cap open (unresolved) tickets per user.
  const open = await prisma.supportTicket.count({ where: { userId, status: "open" } });
  if (open >= 10) return jsonError("Masz za dużo otwartych zgłoszeń — poczekaj na odpowiedź.", 409);

  const tid = await currentTenantId();
  const ticket = await prisma.supportTicket.create({
    data: { userId, subject, message, category, ...(tid ? { tenantId: tid } : {}) },
    select: { id: true },
  });

  // Best-effort: notify the portal owner so they see the ticket without polling the admin queue.
  if (tid) {
    const ownerId = (await prisma.tenant.findUnique({ where: { id: tid }, select: { ownerUserId: true } }))?.ownerUserId;
    if (ownerId && ownerId !== userId) {
      await prisma.notification
        .create({ data: { userId: ownerId, type: "system", title: "🎫 Nowe zgłoszenie", message: subject, icon: "🎫", link: "/admin#tickets" } })
        .catch(() => {});
    }
  }

  return NextResponse.json({ ok: true, id: ticket.id });
}
