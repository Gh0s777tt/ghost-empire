// src/app/layout.tsx
// PASS-THROUGH root layout. With next-intl routing the real <html>/<body> live in
// the locale layout (app/[locale]/layout.tsx) and the overlay layout
// (app/overlay/layout.tsx), so each can set its own <html lang>. This root only
// carries app-wide CSS, base metadata/viewport, and the force-dynamic flag.
import type { Metadata, Viewport } from "next";
import "./globals.css";

// CSP nonce (src/proxy.ts) is per-request → every route must render dynamically to
// receive it (a statically-prerendered page ships build-time scripts WITHOUT the
// nonce and they'd be blocked by script-src). Cascades to all routes from here.
export const dynamic = "force-dynamic";

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
};

// Next 15+: themeColor/colorScheme live in viewport, not metadata.
export const viewport: Viewport = {
  themeColor: "#E50914",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return children;
}
