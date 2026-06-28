// src/components/SiteFooter.tsx
// Persistent footer on every page — quick access to legal pages and streamer socials.
import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";
import { SocialLinksRow } from "@/components/SocialLinks";
import { SITE } from "@/lib/site";
import { getCurrentTenant, isFounderBrand } from "@/lib/tenant";

export async function SiteFooter() {
  const t = await getTranslations("footer");
  const tenant = await getCurrentTenant();
  return (
    <footer
      className="relative z-30 border-t border-zinc-900 bg-zinc-950/95 backdrop-blur-md mt-auto"
      style={{ boxShadow: "0 -4px 30px rgba(0,0,0,0.6)" }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          {/* Left — branding */}
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 shrink-0 overflow-hidden rounded-sm ring-1 ring-red-600/40 bg-black">
              <img src={tenant.logoUrl ?? "/brand/skull.png"} alt="" className="w-full h-full object-cover" />
            </div>
            <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-400">
              {tenant.name} © {SITE.year} · {t("community")}
            </div>
          </div>

          {/* Center — social icons */}
          <div className="flex justify-center">
            <SocialLinksRow links={tenant.socialLinks} isFounderPortal={isFounderBrand(tenant)} />
          </div>

          {/* Right — legal links + the white-label funnel entry */}
          {/* py-1.5 on each link = a ≥24px touch target (WCAG 2.5.8 / Lighthouse
              target-size); zinc-400 (not 500) clears the 4.5:1 contrast ratio. */}
          <nav aria-label={t("legalNav")} className="flex flex-wrap items-center justify-center md:justify-end gap-x-4 gap-y-0 text-[10px] font-mono uppercase tracking-widest">
            <Link href="/support" className="inline-block py-1.5 text-zinc-400 hover:text-red-400 transition-colors">
              ♥ {t("support")}
            </Link>
            <span className="text-zinc-800">·</span>
            <Link href="/wiki" className="inline-block py-1.5 text-zinc-400 hover:text-red-400 transition-colors">
              📖 {t("wiki")}
            </Link>
            <span className="text-zinc-800">·</span>
            <Link href="/onboarding" className="inline-block py-1.5 text-red-400/80 hover:text-red-300 transition-colors">
              🚀 {t("launchPortal")}
            </Link>
            <span className="text-zinc-800">·</span>
            <Link href="/about" className="inline-block py-1.5 text-zinc-400 hover:text-red-400 transition-colors">
              {t("about")}
            </Link>
            <span className="text-zinc-800">·</span>
            <Link href="/privacy" className="inline-block py-1.5 text-zinc-400 hover:text-red-400 transition-colors">
              {t("privacy")}
            </Link>
            <span className="text-zinc-800">·</span>
            <Link href="/terms" className="inline-block py-1.5 text-zinc-400 hover:text-red-400 transition-colors">
              {t("terms")}
            </Link>
          </nav>
        </div>
      </div>
    </footer>
  );
}
