"use client";
// src/app/overlay/support-qr/SupportQrOverlayClient.tsx
// Rotating QR carousel for OBS: one support method's QR on screen at a time,
// cycling every ROTATE_MS. Data via the shared overlay stream (feed "support-qr",
// refreshed slowly since QRs are static); the rotation is purely client-side.
import { useEffect, useState } from "react";
import { useOverlayStream } from "@/lib/use-overlay-stream";

type Item = { kind: "link" | "crypto" | "bank"; label: string; network: string | null; icon: string | null; qr: string };
type Feed = { items: Item[] };
const KIND_EMOJI: Record<Item["kind"], string> = { link: "🔗", crypto: "🪙", bank: "🏦" };
const ROTATE_MS = 10_000;

export function SupportQrOverlayClient() {
  const { data, status } = useOverlayStream<Feed>({ feed: "support-qr", intervalMs: 30_000 });
  const items = data?.items ?? [];
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (items.length <= 1) return;
    const id = setInterval(() => setIdx((i) => (i + 1) % items.length), ROTATE_MS);
    return () => clearInterval(id);
  }, [items.length]);

  if (status === "no-token") return <StatusBox msg="Missing ?token=<OVERLAY_TOKEN>" />;
  if (status === "unauthorized") return <StatusBox msg="Invalid token" />;
  if (items.length === 0) return null;

  const cur = items[idx % items.length];

  return (
    <div style={{ position: "fixed", top: 24, left: 24, zIndex: 999999, fontFamily: "'Inter', system-ui, sans-serif", pointerEvents: "none" }}>
      <div
        key={`${cur.label}-${idx}`}
        style={{
          width: 260,
          background: "rgba(9,9,11,0.92)",
          border: "1px solid rgba(255,255,255,0.10)",
          borderRadius: 18,
          padding: 16,
          boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
          textAlign: "center",
          animation: "geqr-in 360ms ease",
        }}
      >
        <div style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: "rgb(var(--brand-rgb))", fontWeight: 700, marginBottom: 10 }}>
          ♥ Wesprzyj / Support
        </div>
        <img src={cur.qr} alt="" width={228} height={228} style={{ borderRadius: 12, display: "block", margin: "0 auto" }} />
        <div style={{ marginTop: 10, color: "#fff", fontSize: 17, fontWeight: 700 }}>
          {cur.icon || KIND_EMOJI[cur.kind]} {cur.label}
        </div>
        {cur.network && (
          <div style={{ color: "#a1a1aa", fontSize: 12, fontFamily: "ui-monospace, monospace", textTransform: "uppercase", marginTop: 2 }}>{cur.network}</div>
        )}
        {items.length > 1 && (
          <div style={{ display: "flex", gap: 5, justifyContent: "center", marginTop: 12 }}>
            {items.map((_, i) => (
              <span key={i} style={{ width: 6, height: 6, borderRadius: 999, background: i === idx % items.length ? "rgb(var(--brand-rgb))" : "rgba(255,255,255,0.25)" }} />
            ))}
          </div>
        )}
      </div>
      <style>{`@keyframes geqr-in { from { opacity: 0; transform: translateY(8px) scale(0.97); } to { opacity: 1; transform: none; } }`}</style>
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
