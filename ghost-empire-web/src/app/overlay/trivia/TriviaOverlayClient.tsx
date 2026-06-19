"use client";
// src/app/overlay/trivia/TriviaOverlayClient.tsx
// Live trivia card for OBS (#524): question + per-option answer bars + countdown,
// revealing the correct answer (green) once the timer ends. Data via the shared
// overlay stream (feed "trivia").
import { useState, useEffect } from "react";
import { useOverlayStream } from "@/lib/use-overlay-stream";

type Opt = { label: string; count: number };
type Feed = { active: boolean; question?: string; reward?: number; options?: Opt[]; total?: number; endsAt?: string | null; correctIndex?: number | null };

export function TriviaOverlayClient() {
  const { data, status } = useOverlayStream<Feed>({ feed: "trivia", intervalMs: 2000 });
  const [now, setNow] = useState(0);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  if (status === "no-token") return <StatusBox msg="Missing ?token=<OVERLAY_TOKEN>" />;
  if (status === "unauthorized") return <StatusBox msg="Invalid token" />;
  if (!data?.active || !data.options) return null;

  const total = data.total ?? 0;
  const secsLeft = data.endsAt ? Math.max(0, Math.ceil((new Date(data.endsAt).getTime() - now) / 1000)) : null;
  const revealed = data.correctIndex != null;

  return (
    <div style={{ position: "fixed", top: 24, left: 24, width: 440, zIndex: 999999, fontFamily: "'Inter', system-ui, sans-serif", pointerEvents: "none" }}>
      <div style={{ background: "rgba(9,9,11,0.93)", border: "1px solid rgba(255,255,255,0.10)", borderRadius: 18, padding: 18, boxShadow: "0 12px 40px rgba(0,0,0,0.5)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <span style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: "rgb(var(--brand-rgb))", fontWeight: 700 }}>🧠 Quiz</span>
          {secsLeft != null && !revealed && (
            <span style={{ fontSize: 13, fontFamily: "ui-monospace, monospace", color: secsLeft <= 5 ? "#f87171" : "#a1a1aa", fontWeight: 700 }}>{secsLeft}s</span>
          )}
          {revealed && <span style={{ fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", color: "#34d399", fontWeight: 700 }}>✓ Wynik</span>}
        </div>
        <div style={{ color: "#fff", fontSize: 18, fontWeight: 700, marginBottom: 12, lineHeight: 1.3 }}>{data.question}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          {data.options.map((o, i) => {
            const pct = total > 0 ? Math.round((o.count / total) * 100) : 0;
            const isCorrect = revealed && data.correctIndex === i;
            return (
              <div key={i} style={{ position: "relative", borderRadius: 9, overflow: "hidden", border: `1px solid ${isCorrect ? "#10b981" : "rgba(255,255,255,0.08)"}`, background: "rgba(255,255,255,0.04)" }}>
                <div style={{ position: "absolute", inset: 0, width: `${pct}%`, background: isCorrect ? "rgba(16,185,129,0.28)" : "rgb(var(--brand-rgb) / 0.22)", transition: "width 0.4s ease" }} />
                <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 11px" }}>
                  <span style={{ color: "#fff", fontSize: 14, fontWeight: isCorrect ? 700 : 500 }}>{isCorrect ? "✓ " : ""}{String.fromCharCode(65 + i)}. {o.label}</span>
                  <span style={{ color: "#d4d4d8", fontSize: 12, fontFamily: "ui-monospace, monospace" }}>{pct}%</span>
                </div>
              </div>
            );
          })}
        </div>
        {data.reward != null && (
          <div style={{ marginTop: 10, fontSize: 11, color: "#a1a1aa", textAlign: "center" }}>Poprawna odpowiedź: <span style={{ color: "#fbbf24", fontWeight: 700 }}>+{data.reward} GT</span></div>
        )}
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
