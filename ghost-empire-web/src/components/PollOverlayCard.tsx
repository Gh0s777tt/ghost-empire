// src/components/PollOverlayCard.tsx
// Shared presentational card for the active-poll OBS overlay — used by the overlay
// (/overlay/polls) and the live preview in /admin#polls. Inline styles only (OBS).

export type PollOverlayOption = { label: string; count: number };

const fmtN = (n: number) => n.toLocaleString("pl-PL");

export function PollOverlayCard({
  question,
  options,
  total,
  accent = "#3b82f6",
  closed = false,
}: {
  question: string;
  options: PollOverlayOption[];
  total: number;
  accent?: string;
  closed?: boolean;
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
          {closed ? "Ankieta zamknięta" : "Ankieta — głosuj!"}
        </span>
        <span style={{ fontSize: 12, fontWeight: 800, color: "#a1a1aa", fontVariantNumeric: "tabular-nums" }}>
          {fmtN(total)} głosów
        </span>
      </div>
      <div style={{ padding: "11px 16px 13px" }}>
        <div style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.25, marginBottom: 10 }}>{question}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {options.map((o, i) => {
            const pct = total > 0 ? (o.count / total) * 100 : 0;
            return (
              <div key={i} style={{ position: "relative", border: `1px solid ${accent}55`, borderRadius: 6, overflow: "hidden" }}>
                <div style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: `${pct}%`, background: `${accent}33` }} />
                <div style={{ position: "relative", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "6px 10px", fontSize: 13 }}>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.label}</span>
                  <span style={{ fontVariantNumeric: "tabular-nums", color: "#a1a1aa", flexShrink: 0 }}>
                    {pct.toFixed(0)}% · {fmtN(o.count)}
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
