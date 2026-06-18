"use client";
// src/app/overlay/widget/CustomWidgetOverlayClient.tsx
// Renders one custom widget (by ?id=) at its configured position. Realtime via SSE
// (/api/overlay/stream/widget) + polling fallback so admin edits show up live.
import { useEffect, useState, type CSSProperties } from "react";
import { CustomWidgetCard } from "@/components/CustomWidgetCard";
import { useOverlayStream } from "@/lib/use-overlay-stream";

const PAD = 24;

type Feed =
  | { exists: false }
  | {
      exists: true;
      text: string;
      accentColor: string;
      textColor: string;
      fontSizePx: number;
      fontFamily: string;
      position: string;
      posXPct: number | null;
      posYPct: number | null;
      showCard: boolean;
      bgGradient: boolean;
      bgColor1: string;
      bgColor2: string;
      bgAngle: number;
    };

function positionStyle(f: { position: string; posXPct: number | null; posYPct: number | null }): CSSProperties {
  const s: CSSProperties = { position: "fixed", zIndex: 999999, pointerEvents: "none" };
  // Free drag position (set in the widget builder) takes precedence over the 9-slot `position`.
  if (f.posXPct != null && f.posYPct != null) {
    s.left = `${f.posXPct}%`; s.top = `${f.posYPct}%`; s.transform = "translate(-50%, -50%)";
    return s;
  }
  const position = f.position;
  if (position === "center") {
    s.top = "50%"; s.left = "50%"; s.transform = "translate(-50%, -50%)";
    return s;
  }
  const [v, h] = position.split("-");
  if (v === "top") s.top = PAD; else s.bottom = PAD;
  if (h === "left") s.left = PAD;
  else if (h === "right") s.right = PAD;
  else { s.left = "50%"; s.transform = "translateX(-50%)"; }
  return s;
}

export function CustomWidgetOverlayClient() {
  const [id, setId] = useState<string | null>(null);
  const [missingId, setMissingId] = useState(false);

  // The widget id is a SERVER param (sent on both transports via the hook query).
  useEffect(() => {
    const i = new URL(window.location.href).searchParams.get("id");
    if (!i) { setMissingId(true); return; }
    setId(i);
  }, []);

  const { data: feed, status } = useOverlayStream<Feed>({ feed: "widget", query: { id }, intervalMs: 8000 });

  if (status === "no-token") return <StatusBox msg="Missing ?token=<OVERLAY_TOKEN>" />;
  if (missingId) return <StatusBox msg="Missing ?id=<WIDGET_ID>" />;
  if (status === "unauthorized") return <StatusBox msg="Invalid token" />;
  if (!feed || !feed.exists) return null;

  return (
    <div style={positionStyle(feed)}>
      <CustomWidgetCard
        text={feed.text}
        accentColor={feed.accentColor}
        textColor={feed.textColor}
        fontSizePx={feed.fontSizePx}
        fontFamily={feed.fontFamily}
        showCard={feed.showCard}
        bgGradient={feed.bgGradient}
        bgColor1={feed.bgColor1}
        bgColor2={feed.bgColor2}
        bgAngle={feed.bgAngle}
      />
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
