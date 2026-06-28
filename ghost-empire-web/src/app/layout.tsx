// src/app/layout.tsx
// PASS-THROUGH root layout. With next-intl routing the real <html>/<body> live in
// the locale layout (app/[locale]/layout.tsx) and the overlay layout
// (app/overlay/layout.tsx), so each can set its own <html lang>. This root only
// carries app-wide CSS, base metadata/viewport, and the force-dynamic flag.
import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";
import { SITE } from "@/lib/site";
import { getCurrentTenant, isPlatformBrand } from "@/lib/tenant";

// CSP nonce (src/proxy.ts) is per-request → every route must render dynamically to
// receive it (a statically-prerendered page ships build-time scripts WITHOUT the
// nonce and they'd be blocked by script-src). Cascades to all routes from here.
export const dynamic = "force-dynamic";

// Per-tenant brand in titles / OG / Twitter (Phase 5). force-dynamic above means
// this runs per request, so the Host-resolved tenant is always the right one.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getCurrentTenant();
  // Absolute origin of THIS request — on a tenant subdomain the OG image URL
  // must point at the same Host (that's what resolves the tenant), not SITE.url.
  const h = await headers();
  const host = h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  const origin = host ? `${proto}://${host}` : SITE.url;
  // The founder keeps the hand-made static image; tenants get the dynamic one.
  const ogImage = t.slug === "ghost-empire" ? `${origin}/og-founder.jpg` : `${origin}/api/og`;
  // Platform brands (E-Forge / founder) are universal portals — their OG/Twitter
  // descriptions must not frame them as one streamer's community (#763). A streamer's
  // own portal still names the streamer.
  const platform = isPlatformBrand(t);
  const ogDesc = platform
    ? `Oficjalny portal społeczności ${t.name}. Ekonomia ${t.tokenName}, eventy, sklep, ranking.`
    : `Oficjalny portal społeczności streamera ${t.ownerHandle}. Ekonomia ${t.tokenName}, eventy, sklep, ranking.`;
  const twitterDesc = platform
    ? `Oficjalny portal społeczności ${t.name}`
    : `Oficjalny portal społeczności streamera ${t.ownerHandle}`;
  return {
    metadataBase: new URL(SITE.url),
    title: {
      default: t.name,
      template: `%s | ${t.name}`,
    },
    description:
      `Oficjalny portal społeczności ${t.name}. Zbieraj ${t.tokenName}, wymieniaj na nagrody, rywalizuj w rankingu.`,
    // Per-tenant SEO keywords (#655 white-label): derive from the portal's own brand
    // instead of the founder's static SITE.keywords (which leaked "ghost empire" onto
    // every portal). Lowercased + deduped; the generic streaming terms stay.
    keywords: Array.from(
      new Set(
        [t.name, t.shortName, t.ownerHandle, t.tokenName, "twitch", "kick", "youtube", "streaming", "discord"]
          .filter(Boolean)
          .map((k) => k.toLowerCase()),
      ),
    ),
    authors: [{ name: t.ownerHandle }],
    creator: t.ownerHandle,
    openGraph: {
      title: t.name,
      description: ogDesc,
      type: "website",
      locale: "pl_PL",
      siteName: t.shortName,
      url: origin,
      images: [{ url: ogImage, width: 1200, height: 630, alt: t.name }],
    },
    twitter: {
      card: "summary_large_image",
      title: t.name,
      description: twitterDesc,
      creator: `@${t.ownerHandle}`,
      images: [ogImage],
    },
    robots: {
      index: true,
      follow: true,
    },
    // PWA: iOS standalone (Add to Home Screen). The apple-touch-icon is served
    // automatically from app/apple-icon.png; the web manifest covers Android.
    appleWebApp: {
      capable: true,
      statusBarStyle: "black-translucent",
      title: t.shortName,
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
