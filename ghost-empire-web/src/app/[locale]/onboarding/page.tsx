// src/app/[locale]/onboarding/page.tsx
// "Launch your own portal" wizard (SaaS Phase 6) — a logged-in streamer reserves
// a white-label portal with a 14-day trial. Login required (the tenant needs an
// owner account); guests get bounced to sign-in and come right back.
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { auth } from "@/lib/auth";
import { Header } from "@/components/Header";
import { OnboardingClient } from "@/components/onboarding/OnboardingClient";
import { localeAlternates } from "@/i18n/metadata";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "onboarding" });
  return {
    title: t("metaTitle"),
    description: t("metaDesc"),
    alternates: localeAlternates("/onboarding", locale),
  };
}

export default async function OnboardingPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/auth/signin?callbackUrl=/onboarding");
  }
  return (
    <>
      <Header />
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-10 w-full">
        <OnboardingClient />
      </main>
    </>
  );
}
