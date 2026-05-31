// src/components/CodeCard.tsx
// Shared presentational card for a giveaway code — used by the OBS overlay
// (/overlay/codes) and the live preview in /admin#drops. Pure styling.
export function CodeCard({
  title,
  label,
  code,
  accent,
  sizeScale = 1,
  scaleOrigin = "center",
}: {
  title: string;
  label?: string | null;
  code: string;
  accent: string;
  sizeScale?: number;
  scaleOrigin?: string;
}) {
  return (
    <div style={{ transform: `scale(${sizeScale})`, transformOrigin: scaleOrigin }}>
      <div
        style={{
          position: "relative",
          background: "rgba(15, 15, 20, 0.92)",
          backdropFilter: "blur(10px)",
          borderRadius: 16,
          padding: "18px 24px",
          minWidth: 320,
          maxWidth: 460,
          boxShadow: `0 20px 50px rgba(0,0,0,0.55), 0 0 0 1px ${accent}55, 0 0 28px ${accent}33`,
          borderLeft: `4px solid ${accent}`,
          color: "#fff",
          textAlign: "center",
          fontFamily: "'Inter', system-ui, sans-serif",
        }}
      >
        <div
          style={{
            fontSize: 13,
            fontWeight: 800,
            letterSpacing: 1.5,
            color: accent,
            textTransform: "uppercase",
            marginBottom: label ? 6 : 10,
          }}
        >
          {title}
        </div>
        {label && (
          <div style={{ fontSize: 15, color: "#d4d4d8", marginBottom: 10 }}>{label}</div>
        )}
        <div
          style={{
            fontSize: 26,
            fontWeight: 900,
            letterSpacing: 2,
            fontFamily: "'JetBrains Mono', ui-monospace, monospace",
            background: `${accent}1a`,
            border: `1px solid ${accent}55`,
            borderRadius: 10,
            padding: "10px 16px",
            wordBreak: "break-all",
          }}
        >
          {code}
        </div>
      </div>
    </div>
  );
}
