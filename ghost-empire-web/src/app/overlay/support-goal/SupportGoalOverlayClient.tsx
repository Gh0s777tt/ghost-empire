"use client";
// src/app/overlay/support-goal/SupportGoalOverlayClient.tsx
// Live fundraising-goal bar for OBS: the streamer's active support goal (#519)
// rendered as a progress bar that fills as they bump the collected amount in
// /admin#payments. Data via the shared overlay stream (feed "support-goal").
import { useOverlayStream } from "@/lib/use-overlay-stream";

type Feed =
  | { active: false }
  | { active: true; title: string; target: number; current: number; currency: string; pct: number };

const fmt = (n: number) => n.toLocaleString("en-US").replace(/,/g, " ");

export function SupportGoalOverlayClient() {
  const { data, status } = useOverlayStream<Feed>({ feed: "support-goal", intervalMs: 5_000 });

  if (status === "no-token") return <StatusBox msg="Missing ?token=<OVERLAY_TOKEN>" />;
  if (status === "unauthorized") return <StatusBox msg="Invalid token" />;
  if (!data || !data.active) return null;

  const { title, target, current, currency, pct } = data;
  const reached = pct >= 100;

  return (
    <div style={{ position: "fixed", top: 24, left: 24, zIndex: 999999, fontFamily: "'Inter', system-ui, sans-serif", pointerEvents: "none" }}>
      <div
        style={{
          width: 340,
          background: "rgba(9,9,11,0.92)",
          border: "1px solid rgba(255,255,255,0.10)",
          borderRadius: 18,
          padding: 16,
          boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, marginBottom: 10 }}>
          <div style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: "rgb(var(--brand-rgb))", fontWeight: 700 }}>
            ♥ {reached ? "Goal reached!" : "Support Goal"}
          </div>
          <div style={{ fontSize: 13, fontWeight: 800, color: "#fff", fontVariantNumeric: "tabular-nums" }}>{pct}%</div>
        </div>

        <div style={{ color: "#fff", fontSize: 18, fontWeight: 700, marginBottom: 10, lineHeight: 1.2 }}>{title}</div>

        <div style={{ height: 16, borderRadius: 999, background: "rgba(255,255,255,0.08)", overflow: "hidden", position: "relative" }}>
          <div
            style={{
              height: "100%",
              width: `${pct}%`,
              borderRadius: 999,
              background: reached
                ? "linear-gradient(90deg, #22c55e, #4ade80)"
                : "linear-gradient(90deg, rgb(var(--brand-rgb)), rgba(var(--brand-rgb),0.65))",
              transition: "width 800ms cubic-bezier(0.22,1,0.36,1)",
              boxShadow: "0 0 16px rgba(var(--brand-rgb),0.6)",
            }}
          />
          <div style={{ position: "absolute", inset: 0, animation: "gegoal-shimmer 2.4s linear infinite", background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.18), transparent)", backgroundSize: "50% 100%", backgroundRepeat: "no-repeat" }} />
        </div>

        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginTop: 10, fontVariantNumeric: "tabular-nums" }}>
          <div style={{ color: "#fff", fontSize: 16, fontWeight: 800 }}>
            {fmt(current)} <span style={{ color: "#a1a1aa", fontSize: 12, fontWeight: 600 }}>{currency}</span>
          </div>
          <div style={{ color: "#a1a1aa", fontSize: 12 }}>/ {fmt(target)} {currency}</div>
        </div>
      </div>
      <style>{`@keyframes gegoal-shimmer { from { background-position: -60% 0; } to { background-position: 160% 0; } }`}</style>
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
