"use client";
// src/app/overlay/sponsors/SponsorsOverlayClient.tsx
// Rotating sponsors card for OBS: one partner on screen at a time, cycling every
// ROTATE_MS. Data via the shared overlay stream (feed "sponsors", refreshed slowly);
// the rotation is purely client-side. Hidden until there's a sponsor.
import { useEffect, useState } from "react";
import { useOverlayStream } from "@/lib/use-overlay-stream";

type Item = { name: string; logoUrl: string | null; tier: string | null };
type Feed = { items: Item[] };
const ROTATE_MS = 8_000;

export function SponsorsOverlayClient() {
  const { data, status } = useOverlayStream<Feed>({ feed: "sponsors", intervalMs: 30_000 });
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
        key={`${cur.name}-${idx}`}
        style={{
          minWidth: 220,
          background: "rgba(9,9,11,0.92)",
          border: "1px solid rgba(255,255,255,0.10)",
          borderRadius: 18,
          padding: "14px 18px",
          boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
          textAlign: "center",
          animation: "gesp-in 360ms ease",
        }}
      >
        <div style={{ fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: "rgb(var(--brand-rgb))", fontWeight: 700, marginBottom: 10 }}>
          {cur.tier ? `${cur.tier} sponsor` : "Sponsored by"}
        </div>
        {cur.logoUrl ? (
          <img src={cur.logoUrl} alt={cur.name} style={{ height: 48, maxWidth: 240, objectFit: "contain", display: "block", margin: "0 auto" }} />
        ) : (
          <div style={{ color: "#fff", fontSize: 24, fontWeight: 800 }}>{cur.name}</div>
        )}
        {cur.logoUrl && <div style={{ marginTop: 8, color: "#a1a1aa", fontSize: 13, fontWeight: 600 }}>{cur.name}</div>}
        {items.length > 1 && (
          <div style={{ display: "flex", gap: 5, justifyContent: "center", marginTop: 12 }}>
            {items.map((_, i) => (
              <span key={i} style={{ width: 6, height: 6, borderRadius: 999, background: i === idx % items.length ? "rgb(var(--brand-rgb))" : "rgba(255,255,255,0.25)" }} />
            ))}
          </div>
        )}
      </div>
      <style>{`@keyframes gesp-in { from { opacity: 0; transform: translateY(8px) scale(0.97); } to { opacity: 1; transform: none; } }`}</style>
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
