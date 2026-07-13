// src/app/[locale]/layout.tsx
// Localized root layout — provides <html lang={locale}>, fonts, Providers, footer
// and the next-intl client provider. PL is unprefixed ("/"), English under "/en".
import { Inter, JetBrains_Mono } from "next/font/google";
import { cookies, headers } from "next/headers";
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
import { PresenceBeacon } from "@/components/PresenceBeacon";
import { GOOGLE_FONTS_HREF } from "@/lib/widget-fonts";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { routing } from "@/i18n/routing";

// Speculation Rules API (#775): browser-level document prefetch on pointer-down
// ("conservative" = mousedown/touchstart only — near-zero waste) for viewer pages, so HARD
// navigations (first hit, back from external, overlay→site) start with warm HTML. Soft navs
// still go through the Next router (which has its own RSC prefetch). Admin/API/auth/overlay
// and the deck are excluded. Unknown to a browser = silently ignored; CSP allows exactly
// this block via 'inline-speculation-rules' (no JS can run through it).
const SPECULATION_RULES = JSON.stringify({
  prefetch: [
    {
      where: {
        and: [
          { href_matches: "/*" },
          { not: { href_matches: "/admin*" } },
          { not: { href_matches: "/api/*" } },
          { not: { href_matches: "/auth/*" } },
          { not: { href_matches: "/overlay*" } },
          { not: { href_matches: "/deck*" } },
        ],
      },
      eagerness: "conservative",
    },
  ],
});

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
  // Scope the client i18n bundle per route: the `admin` namespace is ~84 KB (over half
  // the catalog) and is only ever read by client components under /admin. Ship it there,
  // and keep it off every viewer page's payload. Server components use getTranslations()
  // (the full catalog, independent of this), so they are unaffected.
  const hdrs = await headers();
  const pathname = hdrs.get("x-pathname") ?? "";
  const nonce = hdrs.get("x-nonce") ?? ""; // CSP nonce (set in proxy.ts) for the async-font swap
  const isAdminRoute = /(^|\/)admin(\/|$)/.test(pathname);
  const clientMessages = isAdminRoute
    ? messages
    : Object.fromEntries(Object.entries(messages).filter(([ns]) => ns !== "admin"));
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
        {/* Display fonts (Anton, Bebas Neue, Oswald…) for widgets/overlays/chat — not in
            next/font, loaded by literal family name. NON-render-blocking: fetched as
            media="print" (low priority, doesn't block first paint), then swapped to "all"
            once loaded via a nonce'd (CSP-safe) inline script. Viewer body text uses
            next/font Inter, so it never waited on these. <noscript> keeps them with JS off. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link id="nx-display-fonts" href={GOOGLE_FONTS_HREF} rel="stylesheet" media="print" />
        <noscript><link href={GOOGLE_FONTS_HREF} rel="stylesheet" /></noscript>
        <script
          nonce={nonce}
          dangerouslySetInnerHTML={{
            __html:
              "var l=document.getElementById('nx-display-fonts');if(l){if(l.sheet){l.media='all'}else{l.onload=function(){l.media='all'}}}",
          }}
        />
      </head>
      <body style={brandStyle} className={`${inter.variable} ${jetbrainsMono.variable} font-sans bg-black text-zinc-200 antialiased min-h-screen flex flex-col`}>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:start-3 focus:z-100000 focus:bg-red-600 focus:text-white focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:outline-hidden"
        >
          {t("skipToContent")}
        </a>
        <NextIntlClientProvider messages={clientMessages}>
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
        {/* Portal presence heartbeat (#767) — no UI; dormant without Redis. */}
        <PresenceBeacon />
        {/* Speculation Rules (#775) — pointer-down document prefetch for viewer pages. */}
        <script type="speculationrules" dangerouslySetInnerHTML={{ __html: SPECULATION_RULES }} />
      </body>
    </html>
  );
}
