// src/app/api/alerts/recent-events/route.ts
// Token-gated feed for the "last sub" / "last donator" OBS widgets. Derives the most
// recent sub + donation from the existing StreamAlert log — no new ingestion needed.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isValidOverlayToken } from "@/lib/alerts";

export const dynamic = "force-dynamic";

// A spaced actorName is a leaked real name (e.g. from a donation) — show only the
// first token, matching the privacy masking used in the alerts overlay/log.
function safeName(name: string | null): string {
  if (!name) return "Anonim";
  return name.includes(" ") ? name.split(" ")[0] : name;
}

async function lastOf(types: string[]) {
  const a = await prisma.streamAlert.findFirst({
    where: { type: { in: types } },
    orderBy: { createdAt: "desc" },
    select: { actorName: true, amount: true, amountLabel: true, createdAt: true },
  });
  if (!a) return null;
  return {
    name: safeName(a.actorName),
    amount: a.amount ?? null,
    amountLabel: a.amountLabel ?? null,
    at: a.createdAt.toISOString(),
  };
}

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token");
  if (!(await isValidOverlayToken(token))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [sub, donation, follow] = await Promise.all([
    lastOf(["twitch_sub", "twitch_gift_sub"]),
    lastOf(["donation"]),
    lastOf(["twitch_follow"]),
  ]);

  return NextResponse.json({ sub, donation, follow });
}
