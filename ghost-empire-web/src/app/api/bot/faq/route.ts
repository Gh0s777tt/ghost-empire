// src/app/api/bot/faq/route.ts
// PUBLIC GET — ghost-empire-chat fetches enabled FAQ auto-responses periodically
// (mirrors /api/bot/chat-commands). The bot replies when a message matches a keyword.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentTenantId } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export async function GET() {
  const tid = await currentTenantId();
  const faqs = await prisma.faqResponse.findMany({
    where: { enabled: true, ...(tid ? { OR: [{ tenantId: tid }, { tenantId: null }] } : {}) },
    orderBy: { createdAt: "asc" },
    select: { keyword: true, matchType: true, response: true, cooldownSeconds: true },
  });
  return NextResponse.json({ faqs });
}
