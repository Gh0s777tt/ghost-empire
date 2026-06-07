// src/app/layout.tsx
// PASS-THROUGH root layout. With next-intl routing the real <html>/<body> live in
// the locale layout (app/[locale]/layout.tsx) and the overlay layout
// (app/overlay/layout.tsx), so each can set its own <html lang>. This root only
// carries app-wide CSS, base metadata/viewport, and the force-dynamic flag.
import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SITE } from "@/lib/site";

// CSP nonce (src/proxy.ts) is per-request → every route must render dynamically to
// receive it (a statically-prerendered page ships build-time scripts WITHOUT the
// nonce and they'd be blocked by script-src). Cascades to all routes from here.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: {
    default: SITE.name,
    template: `%s | ${SITE.name}`,
  },
  description:
    `Oficjalny portal społeczności ${SITE.name}. Zbieraj Ghost Tokens, wymieniaj na nagrody, rywalizuj w rankingu.`,
  keywords: [...SITE.keywords],
  authors: [{ name: SITE.owner }],
  creator: SITE.owner,
  openGraph: {
    title: SITE.name,
    description: `Oficjalny portal społeczności streamera ${SITE.owner}. Ekonomia Ghost Tokens, eventy, sklep, ranking.`,
    type: "website",
    locale: "pl_PL",
    siteName: SITE.shortName,
    url: SITE.url,
  },
  twitter: {
    card: "summary_large_image",
    title: SITE.name,
    description: `Oficjalny portal społeczności streamera ${SITE.owner}`,
    creator: SITE.ownerHandle,
  },
  robots: {
    index: true,
    follow: true,
  },
};

// Next 15+: themeColor/colorScheme live in viewport, not metadata.
export const viewport: Viewport = {
  themeColor: SITE.brandColor,
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return children;
}
