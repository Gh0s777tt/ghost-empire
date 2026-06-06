"use client";
// src/app/overlay/viewers/ViewersOverlayClient.tsx
// Realtime viewer count via SSE (/api/overlay/stream/viewers) + polling fallback;
// shows a small "👁 N" badge while live. Hidden when offline / not configured.
import { useEffect, useState } from "react";
import { useOverlayStream } from "@/lib/use-overlay-stream";

type Feed = { live: boolean; configured?: boolean; viewers?: number; game?: string | null };

export function ViewersOverlayClient() {
  const { data: feed, status } = useOverlayStream<Feed>({ feed: "viewers", intervalMs: 20_000 });
  const [accent, setAccent] = useState("#E50914");

  // Accent is a client-only display override from the URL (not sent to the server).
  useEffect(() => {
    const a = new URL(window.location.href).searchParams.get("accent");
    if (a && /^[0-9a-fA-F]{6}$/.test(a)) setAccent(`#${a}`);
  }, []);

  if (status === "no-token") return <StatusBox msg="Missing ?token=<OVERLAY_TOKEN>" />;
  if (status === "unauthorized") return <StatusBox msg="Invalid token" />;
  if (!feed || !feed.live || typeof feed.viewers !== "number") return null;

  return (
    <div style={{ position: "fixed", top: 16, left: 16, zIndex: 999999, pointerEvents: "none" }}>
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          background: "rgba(15, 15, 20, 0.92)",
          backdropFilter: "blur(10px)",
          borderRadius: 999,
          padding: "7px 14px",
          border: `2px solid ${accent}`,
          boxShadow: `0 8px 24px rgba(0,0,0,0.5), 0 0 16px ${accent}55`,
          color: "#fff",
          fontFamily: "'Inter', system-ui, sans-serif",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        <span style={{ fontSize: 16 }}>👁</span>
        <span style={{ fontSize: 18, fontWeight: 800 }}>{feed.viewers.toLocaleString("pl-PL")}</span>
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
