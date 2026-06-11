// src/app/welcome/page.tsx
// Landing / first-visit page — a focused hero shown on a visitor's first load
// (see FirstVisitRedirect). Reachable any time at /welcome.
import { getTranslations } from "next-intl/server";
import { localeAlternates } from "@/i18n/metadata";
import { Link } from "@/i18n/navigation";
import { auth } from "@/lib/auth";
import { getCurrentTenant } from "@/lib/tenant";
import { ArrowRight, Coins, Gift, Trophy, MessageSquare, Tv, Radio } from "lucide-react";
import { YoutubeIcon } from "@/components/BrandIcons";
import { SocialLinksRow } from "@/components/SocialLinks";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "welcome" });
  return { title: t("metaTitle"), description: t("metaDesc"), alternates: localeAlternates("/welcome", locale) };
}

export default async function WelcomePage() {
  const session = await auth();
  const isAuthed = !!session?.user?.id;
  const t = await getTranslations("welcome");
  const tenant = await getCurrentTenant();

  const highlights = [
    { icon: Coins, color: "var(--brand)", title: t("hlTokens"), desc: t("hlTokensDesc") },
    { icon: Gift, color: "#10b981", title: t("hlRewards"), desc: t("hlRewardsDesc") },
    { icon: Trophy, color: "#FFD700", title: t("hlCompete"), desc: t("hlCompeteDesc") },
    { icon: MessageSquare, color: "#8b5cf6", title: t("hlBot"), desc: t("hlBotDesc") },
  ];

  return (
    <div className="min-h-screen bg-black relative overflow-hidden flex flex-col">
      {/* Atmosphere */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-1/4 w-[700px] h-[700px] rounded-full blur-[160px] opacity-20"
          style={{ background: "radial-gradient(circle, var(--brand) 0%, transparent 70%)" }} />
        <div className="absolute bottom-[-10%] right-0 w-[600px] h-[600px] rounded-full blur-[150px] opacity-10"
          style={{ background: "radial-gradient(circle, color-mix(in srgb, var(--brand), black 55%) 0%, transparent 70%)" }} />
      </div>

      <main className="relative z-10 flex-1 flex flex-col items-center justify-center text-center px-4 py-16 max-w-4xl mx-auto">
        {/* Logo */}
        <div
          className="w-24 h-24 sm:w-28 sm:h-28 mb-6 overflow-hidden rounded-2xl"
          style={{ border: "2px solid rgba(var(--brand-rgb), 0.4)", boxShadow: "0 0 60px rgba(var(--brand-rgb), 0.35)" }}
        >
          <img src={tenant.logoUrl ?? "/brand/skull.png"} alt={tenant.name} className="w-full h-full object-cover" />
        </div>

        <h1
          className="font-display text-5xl sm:text-7xl text-white tracking-wider mb-4"
          style={{ textShadow: "3px 0 0 rgba(var(--brand-rgb), 0.7), -3px 0 0 color-mix(in srgb, var(--brand), black 60%)" }}
        >
          {tenant.name}
        </h1>
        <p className="text-zinc-300 text-base sm:text-xl max-w-2xl mb-2">
          {t("sub1pre")} <span className="text-red-400 font-semibold">Twitch · Kick · YouTube · Discord</span>.
        </p>
        <p className="text-zinc-500 text-sm sm:text-base max-w-xl mb-8">
          {t.rich("sub2", { b: (chunks) => <strong className="text-white">{chunks}</strong> })}
        </p>

        {/* Platform icons */}
        <div className="flex items-center gap-4 text-zinc-600 mb-10">
          <Tv className="w-5 h-5 hover:text-[#9146FF] transition-colors" />
          <Radio className="w-5 h-5 hover:text-[#53FC18] transition-colors" />
          <YoutubeIcon className="w-5 h-5 hover:text-[#FF0000] transition-colors" />
        </div>

        {/* CTAs */}
        <div className="flex flex-col sm:flex-row items-center gap-3 mb-12">
          {!isAuthed ? (
            <>
              <Link
                href="/auth/signin"
                className="inline-flex items-center gap-2 px-8 py-4 bg-red-600 hover:bg-red-500 text-white font-bold text-sm tracking-widest uppercase transition-all"
              >
                {t("signIn")} <ArrowRight className="w-4 h-4" />
              </Link>
              <Link href="/" className="inline-flex items-center gap-2 px-6 py-4 border border-zinc-700 hover:border-zinc-500 text-zinc-300 font-bold text-sm tracking-widest uppercase transition-all">
                {t("browse")}
              </Link>
            </>
          ) : (
            <Link
              href="/"
              className="inline-flex items-center gap-2 px-8 py-4 bg-red-600 hover:bg-red-500 text-white font-bold text-sm tracking-widest uppercase transition-all"
            >
              {t("enter")} <ArrowRight className="w-4 h-4" />
            </Link>
          )}
        </div>

        {/* Highlights */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full mb-10">
          {highlights.map((h) => {
            const Icon = h.icon;
            return (
              <div
                key={h.title}
                className="border border-zinc-800 bg-zinc-950/70 backdrop-blur-xs p-4 text-start flex items-start gap-3"
                style={{ clipPath: "polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 10px 100%, 0 calc(100% - 10px))" }}
              >
                <div className="w-9 h-9 flex items-center justify-center shrink-0" style={{ background: h.color + "20", border: `1px solid ${h.color}40` }}>
                  <Icon className="w-4 h-4" style={{ color: h.color }} />
                </div>
                <div>
                  <h3 className="font-bold text-white text-sm">{h.title}</h3>
                  <p className="text-zinc-400 text-xs leading-relaxed mt-0.5">{h.desc}</p>
                </div>
              </div>
            );
          })}
        </div>

        <SocialLinksRow />

        <Link href="/about" className="mt-8 py-1.5 text-xs font-mono uppercase tracking-widest text-zinc-400 hover:text-red-400 transition-colors">
          {t("learnMore")}
        </Link>
      </main>
    </div>
  );
}
