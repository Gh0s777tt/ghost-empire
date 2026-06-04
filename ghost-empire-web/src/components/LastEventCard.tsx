// src/components/LastEventCard.tsx
// Shared presentational card for the "last sub" / "last donator" OBS widgets — used
// by the overlay (/overlay/last-event) and the admin widget library. Inline styles.

export function LastEventCard({
  label,
  name,
  detail,
  icon,
  accent = "#E50914",
}: {
  label: string;     // e.g. "Ostatni sub"
  name: string;      // actor handle
  detail?: string | null; // e.g. "20 PLN" / "5000 GT"
  icon?: string;     // emoji
  accent?: string;
}) {
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 12,
        background: "rgba(15, 15, 20, 0.92)",
        backdropFilter: "blur(10px)",
        borderRadius: 12,
        padding: "10px 16px",
        border: `2px solid ${accent}`,
        boxShadow: `0 10px 30px rgba(0,0,0,0.55), 0 0 18px ${accent}55`,
        color: "#fff",
        fontFamily: "'Inter', system-ui, sans-serif",
        whiteSpace: "nowrap",
      }}
    >
      {icon && <span style={{ fontSize: 26, lineHeight: 1 }}>{icon}</span>}
      <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
        <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 2, textTransform: "uppercase", color: accent }}>
          {label}
        </span>
        <span style={{ fontSize: 18, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis" }}>{name}</span>
      </div>
      {detail && (
        <span style={{ fontSize: 14, fontWeight: 800, color: "#facc15", fontVariantNumeric: "tabular-nums", marginLeft: 4 }}>
          {detail}
        </span>
      )}
    </div>
  );
}
