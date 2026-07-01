// src/app/[locale]/deck/page.tsx
// Deck (#774) — a mobile-first live control pad for the streamer: fire alerts, drop a GT
// code, drive the subathon timer — big touch targets, phone-on-the-desk ergonomics. The
// portal is already an installable PWA, so /deck pinned to the home screen acts as the
// "stream deck" companion app. Admin/mod gated here; every action's API re-checks anyway.
import { getTranslations } from "next-intl/server";
import { requireAdminOrModerator } from "@/lib/admin";
import { DeckClient } from "@/components/deck/DeckClient";
import { TransitionLink as Link } from "@/components/TransitionLink";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Deck",
  robots: { index: false, follow: false },
};

export default async function DeckPage() {
  const gate = await requireAdminOrModerator();
  const t = await getTranslations("deck");

  if (!gate.ok) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-6">
        <div className="text-center max-w-sm">
          <div className="text-4xl mb-3">🎛️</div>
          <h1 className="font-display text-2xl text-white mb-2">{t("title")}</h1>
          <p className="text-sm text-zinc-500 mb-4">{t("denied")}</p>
          <Link href="/" className="inline-block px-4 py-2 text-xs font-bold uppercase tracking-widest bg-red-600 hover:bg-red-500 text-white">
            {t("goHome")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black">
      <main className="max-w-xl mx-auto px-4 pb-16 pt-5">
        <DeckClient />
      </main>
    </div>
  );
}
