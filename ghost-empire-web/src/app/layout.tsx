// src/app/layout.tsx
import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { SiteFooter } from "@/components/SiteFooter";
import { GOOGLE_FONTS_HREF } from "@/lib/widget-fonts";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";

// The CSP nonce (src/proxy.ts) is per-request, so every route must render
// dynamically to receive it — a statically-prerendered page ships build-time
// scripts WITHOUT the nonce and they'd be blocked by script-src. The app is
// already almost entirely dynamic (auth()), so this only opts in the handful of
// remaining static pages (/auth/signin, /privacy, /terms, …).
export const dynamic = "force-dynamic";

// Self-host fonts via next/font (eliminates the previous duplicate <link rel="stylesheet">
// to Google Fonts in <head> — fewer round-trips, no CLS, automatic preload).
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
  weight: ["400", "700"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://ghost-empire-web.vercel.app"),
  title: {
    default: "GH0ST EMPIRE",
    template: "%s | GH0ST EMPIRE",
  },
  description:
    "Oficjalny portal społeczności GH0ST EMPIRE. Zbieraj Ghost Tokens, wymieniaj na nagrody, rywalizuj w rankingu.",
  keywords: ["ghost empire", "gh0st", "gh0s77tt", "twitch", "kick", "streaming", "discord", "ghost tokens"],
  authors: [{ name: "Gh0s77tt" }],
  creator: "Gh0s77tt",
  openGraph: {
    title: "GH0ST EMPIRE",
    description: "Oficjalny portal społeczności streamera Gh0s77tt. Ekonomia Ghost Tokens, eventy, sklep, ranking.",
    type: "website",
    locale: "pl_PL",
    siteName: "Ghost Empire",
    url: "https://ghost-empire-web.vercel.app",
  },
  twitter: {
    card: "summary_large_image",
    title: "GH0ST EMPIRE",
    description: "Oficjalny portal społeczności streamera Gh0s77tt",
    creator: "@Gh0s77tt",
  },
  robots: {
    index: true,
    follow: true,
  },
  // Icons (icon.svg, apple-icon) and the manifest are file-based in app/ and
  // auto-injected by Next — no explicit declarations needed here.
};

// Next 15: themeColor/colorScheme live in the viewport export, not metadata.
// themeColor tints the mobile browser chrome (address bar) to the brand red.
export const viewport: Viewport = {
  themeColor: "#E50914",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pl" className="dark">
      <head>
        {/* Display fonts for widgets / overlays / chat (Anton, Bebas Neue, Oswald, …) —
            not in next/font's bundled set, so loaded by literal name via one <link>.
            Files only download when a page renders glyphs in that family. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href={GOOGLE_FONTS_HREF} rel="stylesheet" />
      </head>
      <body className={`${inter.variable} ${jetbrainsMono.variable} font-sans bg-black text-zinc-200 antialiased min-h-screen flex flex-col`}>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-100000 focus:bg-red-600 focus:text-white focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:outline-hidden"
        >
          Przejdź do treści
        </a>
        <Providers>
          <div id="main-content" tabIndex={-1} className="flex-1 flex flex-col outline-hidden">{children}</div>
          <SiteFooter />
        </Providers>
        {/* Privacy-friendly, cookieless web analytics + Core Web Vitals from real prod
            traffic. No-ops outside Vercel, so local dev / self-host is unaffected. */}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
