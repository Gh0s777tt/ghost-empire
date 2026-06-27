// src/app/drops/page.tsx
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { currentTenantId, getCurrentTenant, DEFAULT_TENANT_SLUG } from "@/lib/tenant";
import { streamingChannels } from "@/lib/channels";
import { Header } from "@/components/Header";
import HowItWorks from "@/components/HowItWorks";
import { DropRedeemBox } from "@/components/drops/DropRedeemBox";
import { Gift, Trophy, Clock, Sparkles } from "lucide-react";
import { fmt, formatDate, timeAgo } from "@/lib/utils";

import type { Metadata } from "next";
import { getTranslations, getLocale } from "next-intl/server";
import { localeAlternates } from "@/i18n/metadata";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "drops" });
  return { title: t("metaTitle"), description: t("metaDesc"), alternates: localeAlternates("/drops", locale) };
}

export default async function DropsPage() {
  const session = await auth();
  const isAuthenticated = !!session?.user?.id;
  const locale = await getLocale();
  const t = await getTranslations("drops");
  const tid = await currentTenantId();
  const tenant = await getCurrentTenant();
  const isFounderPortal = tenant.id === null || tenant.slug === DEFAULT_TENANT_SLUG;
  const liveChannel = streamingChannels(tenant.socialLinks, isFounderPortal)[0]?.label;

  let myClaims: Array<{
    id: string;
    reward: number;
    claimedAt: string;
    drop: { code: string; bonusReward: number; bonusSlots: number };
  }> = [];
  let totalEarnedFromDrops = 0;
  let activeDropsCount = 0;

  // Always show active count (no codes — just the number)
  activeDropsCount = await prisma.streamDrop.count({
    where: {
      active: true,
      ...(tid ? { tenantId: tid } : {}),
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
  });

  if (isAuthenticated && session?.user?.id) {
    const claims = await prisma.dropClaim.findMany({
      where: { userId: session.user.id },
      orderBy: { claimedAt: "desc" },
      take: 20,
      include: {
        drop: {
          select: { code: true, bonusReward: true, bonusSlots: true },
        },
      },
    });

    myClaims = claims.map((c) => ({
      id: c.id,
      reward: c.reward,
      claimedAt: c.claimedAt.toISOString(),
      drop: c.drop,
    }));

    const sum = await prisma.dropClaim.aggregate({
      where: { userId: session.user.id },
      _sum: { reward: true },
      _count: { id: true },
    });
    totalEarnedFromDrops = sum._sum.reward ?? 0;
  }

  return (
    <div className="min-h-screen bg-black">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute top-0 left-1/3 w-[700px] h-[700px] rounded-full blur-[160px] opacity-15"
          style={{ background: "radial-gradient(circle, #FF4500 0%, transparent 70%)" }}
        />
      </div>

      <Header />

      <main className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pb-24 pt-6">
        <div className="space-y-6">
          {/* Header */}
          <div>
            <div className="flex items-center gap-3 mb-2">
              <Gift className="w-6 h-6 text-orange-500" />
              <h1
                className="font-display text-4xl text-white tracking-wider"
                style={{ textShadow: "2px 0 0 rgba(255,69,0,0.7), -2px 0 0 rgba(139,0,0,0.4)" }}
              >
                {t("title")}
              </h1>
            </div>
            <p className="text-zinc-500 text-sm">
              {t.rich("subtitle", {
                b: (chunks) => <span className="text-orange-400 font-bold">{chunks}</span>,
              })}
            </p>
            <HowItWorks>{t("help")}</HowItWorks>
          </div>

          {/* Redeem box */}
          <div data-tour="drop-redeem">
            <DropRedeemBox variant="full" isAuthenticated={isAuthenticated} />
          </div>

          {/* Active drops counter */}
          <div className="flex items-center gap-3 border border-zinc-800 bg-zinc-950/50 px-4 py-2.5">
            <Sparkles className="w-4 h-4 text-orange-400" />
            <span className="text-xs text-zinc-400">
              {t("activeDrops")}{" "}
              <span className="text-white font-mono font-bold">{activeDropsCount}</span>
            </span>
            {liveChannel && (
              <span className="text-zinc-700 text-xs ml-auto font-mono uppercase tracking-widest">
                {t("liveAt", { channel: liveChannel })}
              </span>
            )}
          </div>

          {/* User stats */}
          {isAuthenticated && (
            <div className="grid grid-cols-2 gap-3">
              <StatTile
                label={t("statClaimed")}
                value={fmt(myClaims.length, locale)}
                emoji="🎁"
              />
              <StatTile
                label={t("statEarned")}
                value={fmt(totalEarnedFromDrops, locale)}
                suffix={tenant.tokenSymbol}
                emoji="💰"
              />
            </div>
          )}

          {/* History */}
          {isAuthenticated && (
            <div
              className="border border-zinc-800 bg-zinc-950/70 backdrop-blur-xs p-5"
              style={{
                clipPath:
                  "polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 12px 100%, 0 calc(100% - 12px))",
              }}
            >
              <div className="flex items-center gap-2 mb-4">
                <Trophy className="w-4 h-4 text-red-500" />
                <h2 className="font-display text-lg text-white tracking-wider">
                  {t("historyTitle")}
                </h2>
                <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 ml-auto">
                  {t("historyLast", { count: myClaims.length })}
                </span>
              </div>

              {myClaims.length === 0 ? (
                <p className="text-zinc-500 text-sm py-4 text-center">
                  {t("historyEmpty")}
                </p>
              ) : (
                <div className="divide-y divide-zinc-900">
                  {myClaims.map((c) => {
                    const wasBonus =
                      c.drop.bonusReward > 0 &&
                      c.reward > c.drop.bonusReward; // crude detection: if total > bonus, bonus was included
                    return (
                      <div key={c.id} className="flex items-center gap-3 py-2.5">
                        <span className="text-xl">{wasBonus ? "🌟" : "🎁"}</span>
                        <div className="flex-1 min-w-0">
                          <div className="font-mono text-sm text-white">
                            {c.drop.code}
                            {wasBonus && (
                              <span className="ms-2 text-[9px] font-bold tracking-widest uppercase text-yellow-400 px-1.5 py-0.5 border border-yellow-700">
                                {t("bonusBadge")}
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] font-mono text-zinc-600 uppercase tracking-widest">
                            {timeAgo(c.claimedAt, locale)} · {formatDate(c.claimedAt, locale)}
                          </div>
                        </div>
                        <div className="font-mono text-sm font-bold text-green-400 tabular-nums">
                          +{fmt(c.reward, locale)} {tenant.tokenSymbol}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* How it works */}
          <div className="border border-zinc-800 bg-zinc-950/40 p-5">
            <h3 className="font-display text-base text-white tracking-wider mb-3">
              {t("howTitle")}
            </h3>
            <ul className="text-xs text-zinc-400 space-y-1.5">
              <li className="flex gap-2">
                <span className="text-orange-500 shrink-0">▸</span>
                <span>
                  {t.rich("how1", {
                    code: (chunks) => <code className="font-mono text-white">{chunks}</code>,
                  })}
                </span>
              </li>
              <li className="flex gap-2">
                <span className="text-orange-500 shrink-0">▸</span>
                <span>
                  {t.rich("how2", {
                    b: (chunks) => <strong className="text-orange-300">{chunks}</strong>,
                  })}
                </span>
              </li>
              <li className="flex gap-2">
                <span className="text-orange-500 shrink-0">▸</span>
                {t("how3")}
              </li>
              <li className="flex gap-2">
                <span className="text-orange-500 shrink-0">▸</span>
                {t("how4")}
              </li>
              <li className="flex gap-2">
                <span className="text-orange-500 shrink-0">▸</span>
                {t("how5")}
              </li>
            </ul>
          </div>
        </div>
      </main>
    </div>
  );
}

function StatTile({
  label, value, suffix, emoji,
}: {
  label: string; value: string; suffix?: string; emoji: string;
}) {
  return (
    <div className="border border-zinc-800 bg-zinc-950/70 backdrop-blur-xs p-3">
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-base">{emoji}</span>
        <span className="text-[9px] font-mono uppercase tracking-widest text-zinc-500">
          {label}
        </span>
      </div>
      <div className="font-mono text-xl font-bold text-white tabular-nums">
        {value}
        {suffix && <span className="text-zinc-500 text-xs ms-1">{suffix}</span>}
      </div>
    </div>
  );
}
