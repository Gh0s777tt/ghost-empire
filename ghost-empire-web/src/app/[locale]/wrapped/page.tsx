// src/app/[locale]/wrapped/page.tsx
// Season "Wrapped" (#684) — a personal monthly recap (league + bounties + GT + achievements).
import { auth } from "@/lib/auth";
import { currentTenantId } from "@/lib/tenant";
import { Header } from "@/components/Header";
import { WrappedClient } from "@/components/wrapped/WrappedClient";
import { getWrapped } from "@/lib/wrapped";

import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { localeAlternates } from "@/i18n/metadata";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "wrapped" });
  return { title: t("metaTitle"), description: t("metaDesc"), alternates: localeAlternates("/wrapped", locale) };
}

export default async function WrappedPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const sp = await searchParams;
  // #788/B2 — `?m=N` shows N months back (0 = current). Clamped to the last 12 months.
  const monthsBack = Math.max(0, Math.min(11, Number.parseInt(sp.m ?? "0", 10) || 0));
  const session = await auth();
  const userId = session?.user?.id ?? null;
  const tid = await currentTenantId();
  const data = userId ? await getWrapped(userId, tid, monthsBack) : null;
  const t = await getTranslations("wrapped");

  return (
    <div className="min-h-screen bg-black">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[700px] rounded-full blur-[160px] opacity-20"
          style={{ background: "radial-gradient(circle, var(--brand) 0%, transparent 70%)" }}
        />
      </div>

      <Header />

      <main className="relative z-10 max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 pb-24 pt-6">
        {/* #788/B2 — month navigation (prev = older, next = newer). Query-only hrefs keep the locale. */}
        {userId && (
          <div className="flex items-center justify-between mb-4 text-[11px] font-mono uppercase tracking-widest">
            {monthsBack < 11 ? (
              <a href={`?m=${monthsBack + 1}`} className="text-zinc-400 hover:text-white transition-colors">◄ {t("prevMonth")}</a>
            ) : <span />}
            <span className="text-zinc-500">{data?.season.label ?? ""}</span>
            {monthsBack > 0 ? (
              <a href={`?m=${monthsBack - 1}`} className="text-zinc-400 hover:text-white transition-colors">{t("nextMonth")} ►</a>
            ) : <span className="text-zinc-700">{t("thisMonth")}</span>}
          </div>
        )}
        <WrappedClient data={data} isAuthenticated={!!userId} />
      </main>
    </div>
  );
}
