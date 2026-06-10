// src/app/drops/page.tsx
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { currentTenantId } from "@/lib/tenant";
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
                DROP CODES
              </h1>
            </div>
            <p className="text-zinc-500 text-sm">
              Wpisz sekretny kod który Ghost wrzucił na czat. Pierwsi {" "}
              <span className="text-orange-400 font-bold">N osób</span> dostają bonus.
            </p>
            <HowItWorks>{t("help")}</HowItWorks>
          </div>

          {/* Redeem box */}
          <DropRedeemBox variant="full" isAuthenticated={isAuthenticated} />

          {/* Active drops counter */}
          <div className="flex items-center gap-3 border border-zinc-800 bg-zinc-950/50 px-4 py-2.5">
            <Sparkles className="w-4 h-4 text-orange-400" />
            <span className="text-xs text-zinc-400">
              Aktywnych dropów:{" "}
              <span className="text-white font-mono font-bold">{activeDropsCount}</span>
            </span>
            <span className="text-zinc-700 text-xs ml-auto font-mono uppercase tracking-widest">
              Live na twitch.tv/gh0s77tt
            </span>
          </div>

          {/* User stats */}
          {isAuthenticated && (
            <div className="grid grid-cols-2 gap-3">
              <StatTile
                label="Złapane dropy"
                value={fmt(myClaims.length, locale)}
                emoji="🎁"
              />
              <StatTile
                label="Łącznie z dropów"
                value={fmt(totalEarnedFromDrops, locale)}
                suffix="GT"
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
                  TWOJA HISTORIA
                </h2>
                <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 ml-auto">
                  Ostatnie {myClaims.length}
                </span>
              </div>

              {myClaims.length === 0 ? (
                <p className="text-zinc-500 text-sm py-4 text-center">
                  Jeszcze nie złapałeś żadnego dropa. Bądź pierwszym podczas najbliższego live'a.
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
                                BONUS
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] font-mono text-zinc-600 uppercase tracking-widest">
                            {timeAgo(c.claimedAt, locale)} · {formatDate(c.claimedAt, locale)}
                          </div>
                        </div>
                        <div className="font-mono text-sm font-bold text-green-400 tabular-nums">
                          +{fmt(c.reward, locale)} GT
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
              JAK TO DZIAŁA
            </h3>
            <ul className="text-xs text-zinc-400 space-y-1.5">
              <li className="flex gap-2">
                <span className="text-orange-500 shrink-0">▸</span>
                Ghost podczas live'a wrzuca na czat sekretny kod (np. <code className="font-mono text-white">GHOST24</code>).
              </li>
              <li className="flex gap-2">
                <span className="text-orange-500 shrink-0">▸</span>
                Wpisujesz tutaj. Pierwsze N osób dostaje <strong className="text-orange-300">bonus reward</strong> (czasem ×4 standard reward).
              </li>
              <li className="flex gap-2">
                <span className="text-orange-500 shrink-0">▸</span>
                Każdy kod możesz odebrać tylko raz. Próba claimowania ponownie = 409.
              </li>
              <li className="flex gap-2">
                <span className="text-orange-500 shrink-0">▸</span>
                Kody wygasają (najczęściej po 60 minutach). Spóźnisz się = przepadło.
              </li>
              <li className="flex gap-2">
                <span className="text-orange-500 shrink-0">▸</span>
                Drop też nabija progress daily questa "Odbierz drop code".
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
