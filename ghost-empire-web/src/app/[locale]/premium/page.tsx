// src/app/[locale]/premium/page.tsx
// Public "Go Premium" pricing page (#744). Free vs Premium, multi-currency, 14-day
// trial. Static-friendly: all interactivity (currency/period/checkout) is client-side.
import { getTranslations } from "next-intl/server";
import { Header } from "@/components/Header";
import { PremiumClient } from "@/components/premium/PremiumClient";
import { localeAlternates } from "@/i18n/metadata";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "premium" });
  return {
    title: t("metaTitle"),
    description: t("metaDesc"),
    alternates: localeAlternates("/premium", locale),
  };
}

export default function PremiumPage() {
  return (
    <div className="min-h-screen bg-black">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[700px] rounded-full blur-[160px] opacity-15"
          style={{ background: "radial-gradient(circle, #f59e0b 0%, transparent 70%)" }}
        />
      </div>

      <Header />

      <main className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pb-24 pt-8">
        <PremiumClient />
      </main>
    </div>
  );
}
