// src/app/[locale]/not-found.tsx
// 404 page (also catches notFound() calls from server components). Localized via
// next-intl (#747): the request locale resolves from the [locale] segment (falling
// back to the default locale), so a streamer's non-Polish audience sees a translated
// 404 instead of always-Polish copy.
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";

export default async function NotFound() {
  const t = await getTranslations("notFound");
  return (
    <div className="min-h-screen bg-black flex items-center justify-center px-4">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute top-1/4 left-1/4 w-[600px] h-[600px] rounded-full blur-[150px] opacity-15"
          style={{ background: "radial-gradient(circle, var(--brand) 0%, transparent 70%)" }}
        />
      </div>

      <div className="relative z-10 max-w-md w-full text-center">
        <div className="inline-flex items-center justify-center mb-6">
          <div className="w-20 h-20 overflow-hidden rounded-2xl grayscale opacity-60">
            <img src="/brand/skull.png" alt="" className="w-full h-full object-cover" />
          </div>
        </div>

        <h1
          className="font-display text-7xl text-white tracking-wider mb-2"
          style={{ textShadow: "3px 0 0 rgba(229,9,20,0.6), -3px 0 0 rgba(139,0,0,0.4)" }}
        >
          404
        </h1>
        <p
          className="font-display text-2xl text-zinc-400 tracking-wider mb-3"
        >
          {t("subtitle")}
        </p>
        <p className="text-zinc-500 text-sm mb-8 max-w-sm mx-auto">
          {t("desc")}
        </p>

        <div className="flex flex-col sm:flex-row gap-2 justify-center">
          <Link
            href="/"
            className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-red-600 hover:bg-red-500 text-white font-bold text-xs tracking-widest uppercase transition-all"
          >
            <ArrowLeft className="w-4 h-4" />
            {t("home")}
          </Link>
          <Link
            href="/ranking"
            className="inline-flex items-center justify-center gap-2 px-6 py-3 border border-zinc-700 hover:border-zinc-500 text-zinc-300 font-bold text-xs tracking-widest uppercase transition-all"
          >
            {t("ranking")}
          </Link>
        </div>

        <p className="text-zinc-700 text-[10px] font-mono uppercase tracking-widest mt-8">
          {t("footer")}
        </p>
      </div>
    </div>
  );
}
