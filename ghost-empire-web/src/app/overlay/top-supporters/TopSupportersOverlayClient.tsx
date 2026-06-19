"use client";
// src/app/overlay/top-supporters/TopSupportersOverlayClient.tsx
// On-stream "top supporters" credits board for OBS: the all-time biggest tippers
// (#530) rendered as a ranked thank-you list. Data via the shared overlay stream
// (feed "top-supporters"). Hidden until there's at least one supporter.
import { useOverlayStream } from "@/lib/use-overlay-stream";

type Item = { name: string; total: number };
type Feed = { items: Item[]; currency: string | null };

const MEDAL = ["🏆", "🥈", "🥉"];
const fmt = (n: number) => n.toLocaleString("en-US").replace(/,/g, " ");

export function TopSupportersOverlayClient() {
  const { data, status } = useOverlayStream<Feed>({ feed: "top-supporters", intervalMs: 30_000 });

  if (status === "no-token") return <StatusBox msg="Missing ?token=<OVERLAY_TOKEN>" />;
  if (status === "unauthorized") return <StatusBox msg="Invalid token" />;
  const items = data?.items ?? [];
  if (items.length === 0) return null;
  const currency = data?.currency ?? "";

  return (
    <div style={{ position: "fixed", top: 24, left: 24, zIndex: 999999, fontFamily: "'Inter', system-ui, sans-serif", pointerEvents: "none" }}>
      <div
        style={{
          width: 320,
          background: "rgba(9,9,11,0.92)",
          border: "1px solid rgba(255,255,255,0.10)",
          borderRadius: 18,
          padding: 16,
          boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
        }}
      >
        <div style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: "rgb(var(--brand-rgb))", fontWeight: 700, marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
          🏆 Top Supporters
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {items.map((s, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "7px 10px",
                borderRadius: 10,
                background: i === 0 ? "rgba(245,158,11,0.10)" : "rgba(255,255,255,0.03)",
                border: i === 0 ? "1px solid rgba(217,119,6,0.5)" : "1px solid rgba(255,255,255,0.06)",
              }}
            >
              <span style={{ width: 24, textAlign: "center", fontSize: 16, fontWeight: 800, color: "#a1a1aa", fontVariantNumeric: "tabular-nums" }}>
                {MEDAL[i] ?? i + 1}
              </span>
              <span style={{ flex: 1, color: "#fff", fontSize: 16, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</span>
              <span style={{ color: i === 0 ? "#fcd34d" : "#fbbf24", fontSize: 14, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
                {fmt(s.total)}{currency ? ` ${currency}` : ""}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StatusBox({ msg }: { msg: string }) {
  return (
    <div style={{ position: "fixed", top: 12, left: 12, padding: "6px 10px", background: "rgba(0,0,0,0.7)", color: "#fca5a5", fontFamily: "monospace", fontSize: 12, borderRadius: 6 }}>
      {msg}
    </div>
  );
}
