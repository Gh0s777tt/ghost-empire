// src/app/[locale]/wrapped/[username]/opengraph-image.tsx
// Per-user Open Graph card for a public Season "Wrapped" (#691). Unlike the generic /wrapped
// card (#685), the username is in the URL, so the unauthenticated crawler CAN show this user's
// PUBLIC season stats (rank / league / achievements — same data the leaderboard and /u expose;
// never the private GT-flow). Tenant-branded via the Host. Typography + CSS shapes only — no
// emoji / remote fetch (Satori-safe). Node runtime for Prisma access.
import { ImageResponse } from "next/og";
import { prisma } from "@/lib/prisma";
import { getCurrentTenant } from "@/lib/tenant";
import { hexToRgbTriplet } from "@/lib/tenant-host";
import { getWrapped } from "@/lib/wrapped";
import { fmt } from "@/lib/utils";

export const alt = "Season Wrapped";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
// Tolerates staleness — cache 10 min so each social scrape doesn't re-run the Prisma reads + render.
export const revalidate = 600;

const VIBE: Record<string, { pl: string; en: string }> = {
  legend: { pl: "LEGENDA SEZONU", en: "SEASON LEGEND" },
  sharp: { pl: "OKO SNAJPERA", en: "SHARP SHOOTER" },
  profit: { pl: "NA PLUSIE", en: "IN PROFIT" },
  active: { pl: "AKTYWNY GRACZ", en: "ACTIVE PLAYER" },
  newcomer: { pl: "ŚWIEŻA KREW", en: "FRESH BLOOD" },
};

export default async function Image({ params }: { params: Promise<{ username: string; locale: string }> }) {
  const { username, locale } = await params;
  const pl = locale === "pl";
  const tenant = await getCurrentTenant();
  const rgb = hexToRgbTriplet(tenant.brandColor).replaceAll(" ", ",");

  let data = null;
  try {
    const user = await prisma.user.findUnique({ where: { username }, select: { id: true, tenantId: true } });
    if (user) data = await getWrapped(user.id, user.tenantId);
  } catch {
    data = null;
  }

  if (!data) {
    return new ImageResponse(
      (
        <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#0a0a0a", color: "#71717a", fontSize: 48 }}>
          {pl ? "Nie znaleziono" : "Not found"}
        </div>
      ),
      { ...size },
    );
  }

  const vibe = VIBE[data.vibe] ?? VIBE.newcomer;
  const headline = pl ? vibe.pl : vibe.en;
  const stats: Array<{ label: string; value: string }> = [
    { label: pl ? "MIEJSCE" : "RANK", value: `#${fmt(data.rank ?? 0)}` },
    ...(data.league ? [{ label: pl ? "LIGA TYPERÓW" : "LEAGUE", value: `#${fmt(data.league.rank)} · ${Math.round(data.league.winRate * 100)}%` }] : []),
    { label: pl ? "OSIĄGNIĘCIA" : "ACHIEVEMENTS", value: fmt(data.achievementsTotal) },
  ];

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
          background: `radial-gradient(circle at 50% 30%, rgba(${rgb},0.38) 0%, #0a0a0a 62%)`,
          backgroundColor: "#0a0a0a",
          padding: 60,
        }}
      >
        {/* Brand */}
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 18 }}>
          <div style={{ width: 40, height: 40, display: "flex", background: tenant.brandColor, clipPath: "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)" }} />
          <div style={{ fontSize: 26, fontWeight: 900, color: "#ffffff", letterSpacing: "0.12em", textTransform: "uppercase" }}>{tenant.name}</div>
        </div>

        {/* User */}
        <div style={{ fontSize: 64, fontWeight: 900, color: "#ffffff", letterSpacing: "0.03em", display: "flex", textAlign: "center" }}>
          {data.user.name}
        </div>
        <div style={{ marginTop: 8, fontSize: 26, color: "#a1a1aa", letterSpacing: "0.18em", textTransform: "uppercase", display: "flex" }}>
          {(pl ? "Podsumowanie · " : "Season Wrapped · ") + data.season.label}
        </div>

        {/* Vibe headline */}
        <div
          style={{
            marginTop: 26,
            fontSize: 76,
            fontWeight: 900,
            color: "#ffffff",
            letterSpacing: "0.03em",
            textAlign: "center",
            textShadow: `4px 0 0 rgba(${rgb},0.7), -4px 0 0 rgba(139,0,0,0.4)`,
            display: "flex",
          }}
        >
          {headline}
        </div>

        {/* Stats */}
        <div style={{ marginTop: 36, display: "flex", gap: 22 }}>
          {stats.map((s) => (
            <div key={s.label} style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "16px 28px", border: "1px solid #27272a", background: "rgba(24,24,27,0.6)" }}>
              <div style={{ fontSize: 18, letterSpacing: "0.2em", color: "#71717a", marginBottom: 8, display: "flex" }}>{s.label}</div>
              <div style={{ fontSize: 40, fontWeight: 900, color: "#ffffff", display: "flex" }}>{s.value}</div>
            </div>
          ))}
        </div>

        <div style={{ position: "absolute", bottom: 0, left: 0, width: "100%", height: 14, background: tenant.brandColor }} />
      </div>
    ),
    { ...size, headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } },
  );
}
