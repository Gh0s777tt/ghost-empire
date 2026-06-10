// src/app/layout.tsx
// PASS-THROUGH root layout. With next-intl routing the real <html>/<body> live in
// the locale layout (app/[locale]/layout.tsx) and the overlay layout
// (app/overlay/layout.tsx), so each can set its own <html lang>. This root only
// carries app-wide CSS, base metadata/viewport, and the force-dynamic flag.
import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SITE } from "@/lib/site";
import { getCurrentTenant } from "@/lib/tenant";

// CSP nonce (src/proxy.ts) is per-request → every route must render dynamically to
// receive it (a statically-prerendered page ships build-time scripts WITHOUT the
// nonce and they'd be blocked by script-src). Cascades to all routes from here.
export const dynamic = "force-dynamic";

// Per-tenant brand in titles / OG / Twitter (Phase 5). force-dynamic above means
// this runs per request, so the Host-resolved tenant is always the right one.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getCurrentTenant();
  return {
    metadataBase: new URL(SITE.url),
    title: {
      default: t.name,
      template: `%s | ${t.name}`,
    },
    description:
      `Oficjalny portal społeczności ${t.name}. Zbieraj ${t.tokenName}, wymieniaj na nagrody, rywalizuj w rankingu.`,
    keywords: [...SITE.keywords],
    authors: [{ name: t.ownerHandle }],
    creator: t.ownerHandle,
    openGraph: {
      title: t.name,
      description: `Oficjalny portal społeczności streamera ${t.ownerHandle}. Ekonomia ${t.tokenName}, eventy, sklep, ranking.`,
      type: "website",
      locale: "pl_PL",
      siteName: t.shortName,
      url: SITE.url,
    },
    twitter: {
      card: "summary_large_image",
      title: t.name,
      description: `Oficjalny portal społeczności streamera ${t.ownerHandle}`,
      creator: `@${t.ownerHandle}`,
    },
    robots: {
      index: true,
      follow: true,
    },
  };
}

// Next 15+: themeColor/colorScheme live in viewport, not metadata.
export async function generateViewport(): Promise<Viewport> {
  const t = await getCurrentTenant();
  return {
    themeColor: t.brandColor,
    colorScheme: "dark",
    width: "device-width",
    initialScale: 1,
  };
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return children;
}
