"use client";
// src/app/overlay/presence/PresenceOverlayClient.tsx
// Live "N ONLINE" portal-presence chip (#767) via SSE (/api/overlay/stream/presence)
// + polling fallback. Renders nothing when presence is dormant (no Redis) or empty.
import { useEffect, useState } from "react";
import { useOverlayStream } from "@/lib/use-overlay-stream";

type Feed = { active: boolean; online?: number };

export function PresenceOverlayClient() {
  const { data: feed, status } = useOverlayStream<Feed>({ feed: "presence", intervalMs: 5_000 });
  const [accent, setAccent] = useState("#10b981");

  // Accent is a client-only display override from the URL (not sent to the server).
  useEffect(() => {
    const a = new URL(window.location.href).searchParams.get("accent");
    if (a && /^[0-9a-fA-F]{6}$/.test(a)) setAccent(`#${a}`);
  }, []);

  if (status === "no-token") return <StatusBox msg="Missing ?token=<OVERLAY_TOKEN>" />;
  if (status === "unauthorized") return <StatusBox msg="Invalid token" />;
  if (!feed?.active || typeof feed.online !== "number" || feed.online < 1) return null;

  return (
    <div style={{ position: "fixed", top: 16, left: 16, zIndex: 999999, pointerEvents: "none" }}>
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 9,
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
        <span
          style={{
            width: 9,
            height: 9,
            borderRadius: 999,
            background: accent,
            boxShadow: `0 0 8px ${accent}`,
          }}
        />
        <span style={{ fontSize: 18, fontWeight: 800 }}>{feed.online.toLocaleString("pl-PL")}</span>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, opacity: 0.75 }}>ONLINE</span>
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
