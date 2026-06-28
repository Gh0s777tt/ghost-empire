// src/app/[locale]/layout.tsx
// Localized root layout — provides <html lang={locale}>, fonts, Providers, footer
// and the next-intl client provider. PL is unprefixed ("/"), English under "/en".
import { Inter, JetBrains_Mono } from "next/font/google";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";
import { Providers } from "@/components/Providers";
import { SiteFooter } from "@/components/SiteFooter";
import { TenantBrandingProvider } from "@/components/TenantBranding";
import { getCurrentTenant, isFounderBrand, isPlatformBrand } from "@/lib/tenant";
import { streamingChannels } from "@/lib/channels";
import { hexToRgbTriplet } from "@/lib/tenant-host";
import { normalizeTheme } from "@/lib/themes";
import { VIEWER_PREVIEW_COOKIE, readViewerPreview } from "@/lib/viewer-preview";
import TourProvider from "@/components/tour/SiteTour";
import { HelpAssistant } from "@/components/HelpAssistant";
import { CommandPalette } from "@/components/CommandPalette";
import { ClientErrorReporter } from "@/components/ClientErrorReporter";
import { RegisterServiceWorker } from "@/components/pwa/RegisterServiceWorker";
import { GOOGLE_FONTS_HREF } from "@/lib/widget-fonts";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { routing } from "@/i18n/routing";

const inter = Inter({ subsets: ["latin", "cyrillic"], variable: "--font-inter", display: "swap" });
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin", "cyrillic"],
  variable: "--font-mono",
  display: "swap",
  weight: ["400", "700"],
});

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const messages = await getMessages();
  const t = await getTranslations("common");
  // White-label branding for client components ("123 GT" suffixes outside i18n).
  const tenant = await getCurrentTenant();
  const isFounderPortal = isFounderBrand(tenant);
  const branding = {
    tokenName: tenant.tokenName,
    tokenSymbol: tenant.tokenSymbol,
    brandName: tenant.name,
    brandShort: tenant.shortName,
    owner: tenant.ownerHandle,
    logoUrl: tenant.logoUrl,
    brandColor: tenant.brandColor,
    channels: streamingChannels(tenant.socialLinks, isFounderPortal),
    isPlatformBrand: isPlatformBrand(tenant),
  };
  // Tenant accent → CSS variables; globals.css derives every red/glow from these.
  const brandStyle = {
    "--brand": tenant.brandColor,
    "--brand-rgb": hexToRgbTriplet(tenant.brandColor),
    // Optional per-portal background (#audit3): either a built-in DARK gradient template
    // (bgPreset — already dark, applied directly) or a custom image URL (rendered behind a
    // strong dark gradient overlay so text contrast is preserved). The URL is sanitized in
    // tenant.ts (safeMediaUrl) and the preset CSS comes from a fixed allowlist (bg-presets).
    ...(tenant.bgPreset
      ? { backgroundImage: tenant.bgPreset, backgroundSize: "cover", backgroundPosition: "center", backgroundAttachment: "fixed" }
      : tenant.bgImageUrl
        ? {
            backgroundImage: `linear-gradient(rgba(0,0,0,0.86), rgba(0,0,0,0.93)), url("${tenant.bgImageUrl}")`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            backgroundAttachment: "fixed",
          }
        : {}),
  } as React.CSSProperties;
  // Arabic is the only RTL locale so far — flip the document direction so text,
  // alignment and punctuation flow correctly. (Full bidi layout mirroring of
  // physical-property components is a follow-up; dir="rtl" fixes the text itself.)
  const dir = locale === "ar" ? "rtl" : "ltr";
  // Theme preference from a cookie (set by the header picker). Read server-side so
  // the right theme is in the HTML on first paint — no flash, no inline script.
  const cookieStore = await cookies();
  const theme = normalizeTheme(cookieStore.get("theme")?.value);
  // "View as viewer" lens (#audit3) — read here so the header chrome is correct on first paint.
  const viewerPreview = readViewerPreview(cookieStore.get(VIEWER_PREVIEW_COOKIE)?.value);

  return (
    <html lang={locale} dir={dir} data-theme={theme} className="dark">
      <head>
        {/* Display fonts (Anton, Bebas Neue, Oswald…) used by widgets/overlays/chat —
            not in next/font's bundled set, so loaded by literal name via one <link>. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href={GOOGLE_FONTS_HREF} rel="stylesheet" />
      </head>
      <body style={brandStyle} className={`${inter.variable} ${jetbrainsMono.variable} font-sans bg-black text-zinc-200 antialiased min-h-screen flex flex-col`}>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:start-3 focus:z-100000 focus:bg-red-600 focus:text-white focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:outline-hidden"
        >
          {t("skipToContent")}
        </a>
        <NextIntlClientProvider messages={messages}>
          <TenantBrandingProvider value={branding}>
          <Providers initialViewerPreview={viewerPreview}>
            <TourProvider>
              <div id="main-content" tabIndex={-1} className="flex-1 flex flex-col outline-hidden">
                {children}
              </div>
              <SiteFooter />
              {/* Portal-wide help: static quick-links + FAQ for everyone, AI chat
                  for logged-in viewers (degrades gracefully without an AI plan). */}
              <HelpAssistant />
              {/* Cmd/Ctrl+K quick-nav palette (#548) */}
              <CommandPalette />
            </TourProvider>
          </Providers>
          </TenantBrandingProvider>
        </NextIntlClientProvider>
        {/* Privacy-friendly, cookieless analytics + Core Web Vitals (no-op outside Vercel). */}
        <Analytics />
        <SpeedInsights />
        {/* Uncaught client errors → Vercel logs (Sentry-lite, no deps). */}
        <ClientErrorReporter />
        {/* PWA: register the offline/installable service worker (prod only). */}
        <RegisterServiceWorker />
      </body>
    </html>
  );
}
