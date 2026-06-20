// src/app/[locale]/collectibles/page.tsx
// Public collectible-cards page (#551): the catalog + your collection + open GT packs.
import { Header } from "@/components/Header";
import { CollectiblesClient } from "@/components/collectibles/CollectiblesClient";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { localeAlternates } from "@/i18n/metadata";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "collectibles" });
  return { title: t("metaTitle"), description: t("metaDesc"), alternates: localeAlternates("/collectibles", locale) };
}

export default function CollectiblesPage() {
  return (
    <div className="min-h-screen bg-black">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 left-1/3 w-[600px] h-[600px] rounded-full blur-[150px] opacity-15" style={{ background: "radial-gradient(circle, var(--brand) 0%, transparent 70%)" }} />
      </div>
      <Header />
      <main className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pb-24 pt-6">
        <CollectiblesClient />
      </main>
    </div>
  );
}
