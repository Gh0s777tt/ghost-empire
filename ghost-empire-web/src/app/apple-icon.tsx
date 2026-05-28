// src/app/apple-icon.tsx
// Apple home-screen touch icon (180x180 PNG, generated at build). iOS auto-rounds
// corners and dislikes transparency, so this fills the square with a dark bg +
// the brand red hex + ghost. Next auto-injects <link rel="apple-touch-icon">.
import { ImageResponse } from "next/og";

export const runtime = "edge";
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0A0A0A",
          backgroundImage:
            "radial-gradient(circle at 50% 40%, rgba(229,9,20,0.35) 0%, transparent 60%)",
        }}
      >
        <div
          style={{
            width: 120,
            height: 120,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "linear-gradient(135deg, #E50914 0%, #8B0000 100%)",
            clipPath: "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)",
            boxShadow: "0 0 40px rgba(229,9,20,0.5)",
          }}
        >
          <div style={{ fontSize: 64, display: "flex" }}>👻</div>
        </div>
      </div>
    ),
    { ...size },
  );
}
