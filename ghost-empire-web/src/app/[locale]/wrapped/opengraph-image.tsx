// src/app/[locale]/wrapped/opengraph-image.tsx
// Open Graph card for the Season "Wrapped" page (#685). Auto-used as og:image for
// /wrapped (file convention). Generic-but-branded: the crawler that scrapes a shared
// /wrapped link is unauthenticated, so we can't show the sharer's own stats here — the
// personalised numbers ride in the Web-Share TEXT instead. Tenant-branded via the Host
// (mirrors /api/og). Typography + CSS shapes only — no emoji / remote fetch (Satori-safe).
import { ImageResponse } from "next/og";
import { getCurrentTenant } from "@/lib/tenant";
import { hexToRgbTriplet } from "@/lib/tenant-host";
import { monthBounds } from "@/lib/seasons";

export const alt = "Season Wrapped";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getCurrentTenant();
  const rgb = hexToRgbTriplet(t.brandColor).replaceAll(" ", ",");
  const { label } = monthBounds();
  const headline = locale === "pl" ? "PODSUMOWANIE SEZONU" : "SEASON WRAPPED";
  const tagline =
    locale === "pl"
      ? `Predykcje · Bounty · ${t.tokenName}`
      : `Predictions · Bounties · ${t.tokenName}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: `radial-gradient(circle at 50% 32%, rgba(${rgb},0.38) 0%, #0a0a0a 62%)`,
          backgroundColor: "#0a0a0a",
        }}
      >
        {/* Brand */}
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 26 }}>
          <div
            style={{
              width: 44,
              height: 44,
              display: "flex",
              background: t.brandColor,
              clipPath: "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)",
            }}
          />
          <div style={{ fontSize: 30, fontWeight: 900, color: "#ffffff", letterSpacing: "0.12em", textTransform: "uppercase" }}>
            {t.name}
          </div>
        </div>

        {/* Headline */}
        <div
          style={{
            fontSize: 92,
            fontWeight: 900,
            color: "#ffffff",
            letterSpacing: "0.04em",
            textAlign: "center",
            padding: "0 60px",
            textShadow: `4px 0 0 rgba(${rgb},0.7), -4px 0 0 rgba(139,0,0,0.4)`,
          }}
        >
          {headline}
        </div>

        {/* Month chip */}
        <div
          style={{
            marginTop: 22,
            padding: "10px 26px",
            border: `2px solid ${t.brandColor}`,
            color: "#ffffff",
            fontSize: 34,
            fontWeight: 700,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            display: "flex",
          }}
        >
          {label}
        </div>

        {/* Tagline */}
        <div style={{ marginTop: 30, fontSize: 30, color: "#a1a1aa", display: "flex", alignItems: "center", gap: 14 }}>
          <span style={{ color: t.brandColor, fontWeight: 800 }}>{t.tokenSymbol}</span>
          <span>{tagline}</span>
        </div>

        <div style={{ position: "absolute", bottom: 0, left: 0, width: "100%", height: 14, background: t.brandColor }} />
      </div>
    ),
    {
      ...size,
      headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" },
    },
  );
}
