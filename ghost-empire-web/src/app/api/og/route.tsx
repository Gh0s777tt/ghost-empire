// src/app/api/og/route.tsx
// Per-tenant Open Graph image (1200x630), referenced from the root layout's
// generateMetadata. The founder portal keeps its hand-made /og-founder.jpg
// (the layout points there), so this route only ever renders for tenants —
// but it degrades fine for the founder too. Tenant comes from the Host
// (#234), same as every /api/* route. Typography only — no remote logo
// fetch, so the image can never fail on a slow/dead logoUrl.
import { ImageResponse } from "next/og";
import { getCurrentTenant } from "@/lib/tenant";
import { hexToRgbTriplet } from "@/lib/tenant-host";

export const dynamic = "force-dynamic";

export async function GET() {
  const t = await getCurrentTenant();
  const rgb = hexToRgbTriplet(t.brandColor).replaceAll(" ", ",");

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
          background: `radial-gradient(circle at 50% 35%, rgba(${rgb},0.35) 0%, #0a0a0a 60%)`,
          backgroundColor: "#0a0a0a",
        }}
      >
        <div
          style={{
            fontSize: 96,
            fontWeight: 800,
            color: "#ffffff",
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            textAlign: "center",
            padding: "0 60px",
            textShadow: `4px 0 0 rgba(${rgb},0.7)`,
          }}
        >
          {t.name}
        </div>
        <div
          style={{
            marginTop: 28,
            fontSize: 34,
            color: "#a1a1aa",
            display: "flex",
            alignItems: "center",
            gap: 18,
          }}
        >
          <span style={{ color: t.brandColor, fontWeight: 700 }}>
            {t.tokenSymbol}
          </span>
          <span>{t.tokenName}</span>
          <span style={{ color: "#52525b" }}>·</span>
          <span>@{t.ownerHandle}</span>
        </div>
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            width: "100%",
            height: 14,
            background: t.brandColor,
          }}
        />
      </div>
    ),
    {
      width: 1200,
      height: 630,
      // Public, unauthenticated endpoint hit by social crawlers — let the edge
      // serve it instead of re-rendering per request. Branding changes rarely;
      // a rebrand shows up in link previews within the hour.
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    },
  );
}
