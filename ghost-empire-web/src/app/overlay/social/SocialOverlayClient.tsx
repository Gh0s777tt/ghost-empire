"use client";
// src/app/overlay/social/SocialOverlayClient.tsx
// Renders the streamer's latest X / Instagram post as a compact on-stream card.
// Data via the shared overlay transport (SSE + polling fallback); dormant-safe —
// renders nothing until an X/IG token is configured (#755).
import { useOverlayStream } from "@/lib/use-overlay-stream";

type SocialData = {
  active: boolean;
  platform?: "x" | "ig";
  handle?: string | null;
  followers?: number;
  avatarUrl?: string | null;
  text?: string | null;
  imageUrl?: string | null;
  url?: string;
};

const BRAND = { x: { label: "X", color: "#ffffff" }, ig: { label: "Instagram", color: "#E1306C" } } as const;

export function SocialOverlayClient() {
  const { data, status } = useOverlayStream<SocialData>({ feed: "social", intervalMs: 60_000 });

  if (status === "no-token") return <Box msg="Missing ?token=" />;
  if (status === "unauthorized") return <Box msg="Invalid token" />;
  if (!data || !data.active) return null;

  const brand = BRAND[data.platform ?? "x"];
  return (
    <div style={{ position: "fixed", bottom: 24, left: 24, fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div
        style={{
          display: "flex",
          gap: 12,
          maxWidth: 420,
          padding: 14,
          borderRadius: 14,
          background: "rgba(10,10,12,0.9)",
          backdropFilter: "blur(8px)",
          border: `2px solid ${brand.color}`,
          boxShadow: "0 8px 28px rgba(0,0,0,.55)",
          color: "#fff",
        }}
      >
        {data.imageUrl ? (
          <img src={data.imageUrl} alt="" width={84} height={84} style={{ width: 84, height: 84, objectFit: "cover", borderRadius: 8, flexShrink: 0 }} />
        ) : data.avatarUrl ? (
          <img src={data.avatarUrl} alt="" width={48} height={48} style={{ width: 48, height: 48, objectFit: "cover", borderRadius: "50%", flexShrink: 0 }} />
        ) : null}
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <span style={{ fontWeight: 900, letterSpacing: 1, color: brand.color, fontSize: 12 }}>{brand.label.toUpperCase()}</span>
            {data.handle && <span style={{ color: "#a1a1aa", fontSize: 13, fontFamily: "'JetBrains Mono', monospace" }}>@{data.handle}</span>}
            {data.followers != null && data.followers > 0 && (
              <span style={{ color: "#71717a", fontSize: 12 }}>· {data.followers.toLocaleString("pl-PL")}</span>
            )}
          </div>
          {data.text && (
            <p
              style={{
                margin: 0,
                fontSize: 14,
                lineHeight: 1.35,
                color: "#e4e4e7",
                display: "-webkit-box",
                WebkitLineClamp: 3,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
            >
              {data.text}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function Box({ msg }: { msg: string }) {
  return <div style={{ position: "fixed", bottom: 24, left: 24, padding: "12px 16px", borderRadius: 8, background: "rgba(220,38,38,0.85)", color: "#fff", fontFamily: "system-ui", fontSize: 14 }}>{msg}</div>;
}
