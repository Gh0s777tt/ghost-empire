// src/app/[locale]/bounties/page.tsx
// Viewer Bounties (#679) — viewers pool GT behind a challenge for the streamer.
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { currentTenantId } from "@/lib/tenant";
import { Header } from "@/components/Header";
import { BountiesClient } from "@/components/bounties/BountiesClient";

import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { localeAlternates } from "@/i18n/metadata";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "bounties" });
  return { title: t("metaTitle"), description: t("metaDesc"), alternates: localeAlternates("/bounties", locale) };
}

type CreatorRow = { name: string | null; displayName: string | null; username: string | null; image: string | null };
function displayName(c: CreatorRow | null): string {
  return c?.displayName || c?.name || c?.username || "Widmo";
}

export default async function BountiesPage() {
  const session = await auth();
  const userId = session?.user?.id ?? null;
  const tid = await currentTenantId();

  const creatorSelect = { select: { name: true, displayName: true, username: true, image: true } } as const;
  const [open, recent, me] = await Promise.all([
    prisma.bounty.findMany({
      where: { status: "open", ...(tid ? { tenantId: tid } : {}) },
      select: {
        id: true, title: true, description: true, pooledGt: true, createdAt: true, expiresAt: true,
        creator: creatorSelect, _count: { select: { pledges: true } },
      },
      orderBy: [{ pooledGt: "desc" }, { createdAt: "desc" }],
      take: 50,
    }),
    prisma.bounty.findMany({
      where: { status: { in: ["completed", "rejected", "expired"] }, ...(tid ? { tenantId: tid } : {}) },
      select: {
        id: true, title: true, status: true, pooledGt: true, resolvedAt: true,
        creator: creatorSelect, _count: { select: { pledges: true } },
      },
      orderBy: { resolvedAt: "desc" },
      take: 10,
    }),
    userId ? prisma.user.findUnique({ where: { id: userId }, select: { tokens: true } }) : Promise.resolve(null),
  ]);

  const openIds = open.map((b) => b.id);
  const myPledged = userId && openIds.length
    ? new Set(
        (await prisma.bountyPledge.findMany({
          where: { bountyId: { in: openIds }, userId },
          select: { bountyId: true },
          distinct: ["bountyId"],
        })).map((p) => p.bountyId),
      )
    : new Set<string>();

  const openPayload = open.map((b) => ({
    id: b.id,
    title: b.title,
    description: b.description,
    pooledGt: b.pooledGt,
    backers: b._count.pledges,
    creator: { name: displayName(b.creator), image: b.creator?.image ?? null },
    createdAt: b.createdAt.toISOString(),
    expiresAt: b.expiresAt?.toISOString() ?? null,
    iBacked: myPledged.has(b.id),
  }));

  const recentPayload = recent.map((b) => ({
    id: b.id,
    title: b.title,
    status: b.status,
    pooledGt: b.pooledGt,
    backers: b._count.pledges,
    creator: { name: displayName(b.creator), image: b.creator?.image ?? null },
    resolvedAt: b.resolvedAt?.toISOString() ?? null,
  }));

  return (
    <div className="min-h-screen bg-black">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute top-0 left-1/3 w-[600px] h-[600px] rounded-full blur-[150px] opacity-15"
          style={{ background: "radial-gradient(circle, var(--brand) 0%, transparent 70%)" }}
        />
      </div>

      <Header />

      <main className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pb-24 pt-6">
        <BountiesClient
          isAuthenticated={!!userId}
          myTokens={me?.tokens ?? 0}
          open={openPayload}
          recent={recentPayload}
        />
      </main>
    </div>
  );
}
