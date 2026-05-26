// src/app/opengraph-image.tsx
// Default OG image for the root URL — shown on Discord/Twitter/Slack previews
import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Ghost Empire — Community Portal";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
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
          background: "#000",
          backgroundImage:
            "radial-gradient(circle at 30% 30%, rgba(229,9,20,0.4) 0%, transparent 50%), radial-gradient(circle at 70% 70%, rgba(139,0,0,0.3) 0%, transparent 50%)",
          fontFamily: "sans-serif",
          position: "relative",
        }}
      >
        {/* Ghost icon — hex shape */}
        <div
          style={{
            width: 160,
            height: 160,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "linear-gradient(135deg, #E50914 0%, #8B0000 100%)",
            clipPath:
              "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)",
            marginBottom: 40,
            boxShadow: "0 0 80px rgba(229,9,20,0.5)",
          }}
        >
          <div style={{ fontSize: 90 }}>👻</div>
        </div>

        {/* Title with red duotone shadow */}
        <div
          style={{
            fontSize: 110,
            fontWeight: 900,
            color: "white",
            letterSpacing: "0.08em",
            textShadow:
              "4px 0 0 rgba(229,9,20,0.8), -4px 0 0 rgba(139,0,0,0.6)",
            marginBottom: 16,
          }}
        >
          GH0ST EMPIRE
        </div>

        {/* Tagline */}
        <div
          style={{
            fontSize: 28,
            color: "#a1a1aa",
            letterSpacing: "0.2em",
            fontFamily: "monospace",
            textTransform: "uppercase",
            marginBottom: 8,
          }}
        >
          Oficjalny Portal Społeczności
        </div>

        <div
          style={{
            fontSize: 22,
            color: "#71717a",
            marginTop: 12,
          }}
        >
          Twitch · Kick · Discord · Ghost Tokens · Eventy · Sklep
        </div>

        {/* Footer */}
        <div
          style={{
            position: "absolute",
            bottom: 40,
            display: "flex",
            alignItems: "center",
            gap: 16,
            fontSize: 18,
            color: "#52525b",
            fontFamily: "monospace",
          }}
        >
          <span>twitch.tv/gh0s77tt</span>
          <span style={{ color: "#27272a" }}>·</span>
          <span>kick.com/gh0s77tt</span>
          <span style={{ color: "#27272a" }}>·</span>
          <span style={{ color: "#E50914" }}>ghost-empire-web.vercel.app</span>
        </div>
      </div>
    ),
    { ...size },
  );
}
