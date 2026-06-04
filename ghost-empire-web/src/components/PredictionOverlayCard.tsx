// src/components/PredictionOverlayCard.tsx
// Shared presentational card for the active-prediction OBS overlay — used by the
// overlay (/overlay/predictions) and the live preview in /admin#predictions.
// Inline styles only (OBS browser source has no Tailwind).

export type PredictionOverlayOption = { label: string; total: number; count: number };

const fmtN = (n: number) => n.toLocaleString("pl-PL");

export function PredictionOverlayCard({
  question,
  options,
  totalPot,
  accent = "#a855f7",
  locked = false,
}: {
  question: string;
  options: PredictionOverlayOption[];
  totalPot: number;
  accent?: string;
  locked?: boolean;
}) {
  return (
    <div
      style={{
        width: 420,
        maxWidth: "calc(100vw - 32px)",
        background: "rgba(15, 15, 20, 0.92)",
        backdropFilter: "blur(10px)",
        borderRadius: 14,
        border: `2px solid ${accent}`,
        boxShadow: `0 12px 36px rgba(0,0,0,0.6), 0 0 22px ${accent}66`,
        color: "#fff",
        fontFamily: "'Inter', system-ui, sans-serif",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "9px 16px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          borderBottom: `1px solid ${accent}44`,
        }}
      >
        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 2, textTransform: "uppercase", color: accent }}>
          {locked ? "Zakład zamknięty" : "Zakład — obstawiaj!"}
        </span>
        <span style={{ fontSize: 12, fontWeight: 800, color: "#facc15", fontVariantNumeric: "tabular-nums" }}>
          {fmtN(totalPot)} GT
        </span>
      </div>
      <div style={{ padding: "11px 16px 13px" }}>
        <div style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.25, marginBottom: 10 }}>{question}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {options.map((o, i) => {
            const pct = totalPot > 0 ? (o.total / totalPot) * 100 : 0;
            return (
              <div key={i} style={{ position: "relative", border: `1px solid ${accent}55`, borderRadius: 6, overflow: "hidden" }}>
                <div style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: `${pct}%`, background: `${accent}33` }} />
                <div style={{ position: "relative", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "6px 10px", fontSize: 13 }}>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.label}</span>
                  <span style={{ fontVariantNumeric: "tabular-nums", color: "#a1a1aa", flexShrink: 0 }}>
                    {pct.toFixed(0)}% · {fmtN(o.total)} GT
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
