// src/app/api/admin/bounties/route.ts
// Admin — list + resolve/delete Viewer Bounties (#679). "resolve" with outcome
// "completed" keeps (burns) the pool; "rejected" refunds every pledge. Same trust level
// as event/prediction creators (create_events). Tenant-scoped + audit-logged.
import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { logAdminAction } from "@/lib/audit";
import { currentTenantId } from "@/lib/tenant";
import { resolveBounty } from "@/lib/bounties";

type CreatorRow = { name: string | null; displayName: string | null; username: string | null };
function displayName(c: CreatorRow | null): string {
  return c?.displayName || c?.name || c?.username || "Widmo";
}

export async function GET() {
  const auth = await requirePermission("create_events");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const tid = await currentTenantId();
  const all = await prisma.bounty.findMany({
    where: tid ? { tenantId: tid } : {},
    select: {
      id: true, title: true, description: true, status: true, pooledGt: true,
      createdAt: true, resolvedAt: true, expiresAt: true,
      creator: { select: { name: true, displayName: true, username: true } },
      pledges: { select: { amount: true, user: { select: { name: true, displayName: true, username: true } } } },
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 80,
  });

  return NextResponse.json({
    bounties: all.map((b) => {
      // Aggregate pledges per backer, biggest first, so the streamer sees who's behind it.
      const byUser = new Map<string, number>();
      for (const pl of b.pledges) {
        const key = displayName(pl.user);
        byUser.set(key, (byUser.get(key) ?? 0) + pl.amount);
      }
      const topBackers = [...byUser.entries()].sort((a, c) => c[1] - a[1]).slice(0, 5).map(([name, amount]) => ({ name, amount }));
      return {
        id: b.id,
        title: b.title,
        description: b.description,
        status: b.status,
        pooledGt: b.pooledGt,
        backers: byUser.size,
        creator: displayName(b.creator),
        topBackers,
        createdAt: b.createdAt.toISOString(),
        resolvedAt: b.resolvedAt?.toISOString() ?? null,
        expiresAt: b.expiresAt?.toISOString() ?? null,
      };
    }),
  });
}

export async function POST(req: Request) {
  const auth = await requirePermission("create_events");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: { action?: string; id?: string; outcome?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  if (body.action === "resolve") {
    if (!body.id || (body.outcome !== "completed" && body.outcome !== "rejected")) {
      return NextResponse.json({ error: "id + outcome (completed|rejected) wymagane" }, { status: 400 });
    }
    const result = await resolveBounty({ bountyId: body.id, outcome: body.outcome });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    await logAdminAction({
      adminId: auth.userId,
      action: "resolve_bounty",
      targetType: "bounty",
      targetId: body.id,
      details: { outcome: result.outcome, refunded: result.refunded, burned: result.burned },
      req,
    });
    return NextResponse.json(result);
  }

  if (body.action === "delete") {
    if (!body.id) return NextResponse.json({ error: "Brak id" }, { status: 400 });
    const tid = await currentTenantId();
    const bounty = await prisma.bounty.findFirst({ where: { id: body.id, ...(tid ? { tenantId: tid } : {}) } });
    if (!bounty) return NextResponse.json({ error: "Nie znaleziono" }, { status: 404 });
    if (bounty.status === "open") return NextResponse.json({ error: "Najpierw rozstrzygnij/odrzuć" }, { status: 409 });
    await prisma.bounty.delete({ where: { id: body.id } }); // pledges cascade
    await logAdminAction({ adminId: auth.userId, action: "delete_bounty", targetType: "bounty", targetId: body.id, req });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "action: resolve | delete" }, { status: 400 });
}
