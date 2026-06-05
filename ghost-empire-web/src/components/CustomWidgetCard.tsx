// src/components/CustomWidgetCard.tsx
// Shared render for a user-built text widget — used by the overlay (/overlay/widget)
// and the live preview in the admin generator. Inline styles only (OBS).
import { fontStack } from "@/lib/widget-fonts";

export function CustomWidgetCard({
  text,
  accentColor = "#E50914",
  textColor = "#ffffff",
  fontSizePx = 28,
  fontFamily = "Inter",
  showCard = true,
}: {
  text: string;
  accentColor?: string;
  textColor?: string;
  fontSizePx?: number;
  fontFamily?: string;
  showCard?: boolean;
}) {
  const stack = fontStack(fontFamily);

  if (!showCard) {
    return (
      <div
        style={{
          color: textColor,
          fontFamily: stack,
          fontSize: fontSizePx,
          fontWeight: 800,
          lineHeight: 1.2,
          textShadow: "0 2px 8px rgba(0,0,0,0.85), 0 0 2px rgba(0,0,0,0.9)",
          whiteSpace: "pre-wrap",
        }}
      >
        {text}
      </div>
    );
  }

  return (
    <div
      style={{
        display: "inline-block",
        background: "rgba(15, 15, 20, 0.92)",
        backdropFilter: "blur(10px)",
        border: `2px solid ${accentColor}`,
        borderRadius: 12,
        padding: "10px 18px",
        color: textColor,
        fontFamily: stack,
        fontSize: fontSizePx,
        fontWeight: 700,
        lineHeight: 1.25,
        boxShadow: `0 10px 30px rgba(0,0,0,0.55), 0 0 18px ${accentColor}55`,
        whiteSpace: "pre-wrap",
      }}
    >
      {text}
    </div>
  );
}
