// src/app/[locale]/layout.tsx
// Localized root layout — provides <html lang={locale}>, fonts, Providers, footer
// and the next-intl client provider. PL is unprefixed ("/"), English under "/en".
import { Inter, JetBrains_Mono } from "next/font/google";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";
import { Providers } from "@/components/Providers";
import { SiteFooter } from "@/components/SiteFooter";
import { GOOGLE_FONTS_HREF } from "@/lib/widget-fonts";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { routing } from "@/i18n/routing";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
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

  return (
    <html lang={locale} className="dark">
      <head>
        {/* Display fonts (Anton, Bebas Neue, Oswald…) used by widgets/overlays/chat —
            not in next/font's bundled set, so loaded by literal name via one <link>. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href={GOOGLE_FONTS_HREF} rel="stylesheet" />
      </head>
      <body className={`${inter.variable} ${jetbrainsMono.variable} font-sans bg-black text-zinc-200 antialiased min-h-screen flex flex-col`}>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-100000 focus:bg-red-600 focus:text-white focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:outline-hidden"
        >
          {t("skipToContent")}
        </a>
        <NextIntlClientProvider messages={messages}>
          <Providers>
            <div id="main-content" tabIndex={-1} className="flex-1 flex flex-col outline-hidden">
              {children}
            </div>
            <SiteFooter />
          </Providers>
        </NextIntlClientProvider>
        {/* Privacy-friendly, cookieless analytics + Core Web Vitals (no-op outside Vercel). */}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
