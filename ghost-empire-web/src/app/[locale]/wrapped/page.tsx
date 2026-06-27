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

export default async function WrappedPage() {
  const session = await auth();
  const userId = session?.user?.id ?? null;
  const tid = await currentTenantId();
  const data = userId ? await getWrapped(userId, tid) : null;

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
        <WrappedClient data={data} isAuthenticated={!!userId} />
      </main>
    </div>
  );
}
