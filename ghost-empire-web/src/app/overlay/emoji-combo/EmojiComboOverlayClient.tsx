"use client";
// src/app/overlay/emoji-combo/EmojiComboOverlayClient.tsx
// Realtime emoji combos via SSE (/api/overlay/stream/emoji-combo) + polling fallback;
// pops a big emoji + "xN COMBO!" while fresh. Re-animates when a new combo (ts) arrives.
import { useOverlayStream } from "@/lib/use-overlay-stream";

type Feed = { active: boolean; emoji?: string; count?: number; ts?: number };

export function EmojiComboOverlayClient() {
  const { data: feed, status } = useOverlayStream<Feed>({ feed: "emoji-combo", intervalMs: 1500 });

  if (status === "no-token") return <StatusBox msg="Missing ?token=<OVERLAY_TOKEN>" />;
  if (status === "unauthorized") return <StatusBox msg="Invalid token" />;
  if (!feed || !feed.active || !feed.emoji) return null;

  return (
    <div
      style={{
        position: "fixed",
        left: "50%",
        bottom: 80,
        transform: "translateX(-50%)",
        zIndex: 999999,
        pointerEvents: "none",
        fontFamily: "'Anton', 'Inter', system-ui, sans-serif",
      }}
    >
      {/* key on ts so each new combo restarts the pop animation */}
      <div
        key={feed.ts}
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 4,
          animation: "ge-combo-pop 360ms cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      >
        <div style={{ fontSize: 96, lineHeight: 1, animation: "ge-combo-pulse 700ms ease-in-out infinite", filter: "drop-shadow(0 6px 16px rgba(0,0,0,0.6))" }}>
          {feed.emoji}
        </div>
        <div
          style={{
            fontSize: 40,
            fontWeight: 900,
            color: "#fff",
            letterSpacing: 2,
            textShadow: "0 0 14px #E50914, 0 3px 10px rgba(0,0,0,0.85)",
            WebkitTextStroke: "1px rgba(0,0,0,0.4)",
          }}
        >
          ×{feed.count} COMBO!
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
