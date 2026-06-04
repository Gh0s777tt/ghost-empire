// src/components/SubathonCard.tsx
// Shared presentational countdown card for the Subathon overlay — used by the OBS
// overlay (/overlay/subathon) and the live preview in /admin#subathon.

export function formatRemaining(ms: number): string {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export function SubathonCard({
  remainingMs,
  ended,
  accent = "#E50914",
  label = "Subathon",
}: {
  remainingMs: number;
  ended: boolean;
  accent?: string;
  label?: string;
}) {
  const heading = (label || "Subathon").trim();
  return (
    <div
      style={{
        background: "rgba(15, 15, 20, 0.92)",
        backdropFilter: "blur(10px)",
        borderRadius: 14,
        padding: "12px 28px",
        border: `2px solid ${accent}`,
        boxShadow: `0 12px 36px rgba(0,0,0,0.6), 0 0 22px ${accent}73`,
        color: "#fff",
        textAlign: "center",
        fontFamily: "'Inter', system-ui, sans-serif",
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 3, color: accent, textTransform: "uppercase" }}>
        {ended ? `${heading} — koniec!` : heading}
      </div>
      <div style={{ fontSize: 46, fontWeight: 900, fontVariantNumeric: "tabular-nums", lineHeight: 1.1, marginTop: 2 }}>
        {formatRemaining(remainingMs)}
      </div>
    </div>
  );
}
