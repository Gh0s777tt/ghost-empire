"use client";
// src/app/overlay/companion/CompanionOverlayClient.tsx
// Realtime "Champion Companion" badge (top pet by xp) via SSE
// (/api/overlay/stream/companion) + polling fallback. Hidden until someone has fed.
import { useEffect, useState } from "react";
import { useOverlayStream } from "@/lib/use-overlay-stream";

type Feed =
  | { exists: false }
  | { exists: true; name: string; xp: number; owner: string; emoji: string };

export function CompanionOverlayClient() {
  const { data: feed, status } = useOverlayStream<Feed>({ feed: "companion", intervalMs: 8000 });
  const [accent, setAccent] = useState("#E50914");

  useEffect(() => {
    const a = new URL(window.location.href).searchParams.get("accent");
    if (a && /^[0-9a-fA-F]{6}$/.test(a)) setAccent(`#${a}`);
  }, []);

  if (status === "no-token") return <StatusBox msg="Missing ?token=<OVERLAY_TOKEN>" />;
  if (status === "unauthorized") return <StatusBox msg="Invalid token" />;
  if (!feed || !feed.exists) return null;

  return (
    <div style={{ position: "fixed", top: 16, left: 16, zIndex: 999999, pointerEvents: "none" }}>
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 12,
          background: "rgba(15, 15, 20, 0.92)",
          backdropFilter: "blur(10px)",
          borderRadius: 16,
          padding: "10px 16px",
          border: `2px solid ${accent}`,
          boxShadow: `0 8px 24px rgba(0,0,0,0.5), 0 0 16px ${accent}55`,
          color: "#fff",
          fontFamily: "'Inter', system-ui, sans-serif",
        }}
      >
        <span style={{ fontSize: 40, lineHeight: 1 }}>{feed.emoji}</span>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1.5, color: accent, textTransform: "uppercase" }}>👑 Champion Companion</span>
          <span style={{ fontSize: 18, fontWeight: 800 }}>{feed.name}</span>
          <span style={{ fontSize: 12, opacity: 0.8, fontVariantNumeric: "tabular-nums" }}>{feed.owner} · {feed.xp.toLocaleString("pl-PL")} XP</span>
        </div>
      </div>
    </div>
  );
}

function StatusBox({ msg }: { msg: string }) {
  return (
    <div
      style={{
        position: "fixed",
        top: 16,
        left: 16,
        padding: "12px 16px",
        borderRadius: 8,
        background: "rgba(220, 38, 38, 0.85)",
        fontFamily: "system-ui, sans-serif",
        fontSize: 14,
        zIndex: 999999,
        color: "#fff",
      }}
    >
      {msg}
    </div>
  );
}
