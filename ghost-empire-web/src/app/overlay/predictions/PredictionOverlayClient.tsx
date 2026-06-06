"use client";
// src/app/overlay/predictions/PredictionOverlayClient.tsx
// Realtime active prediction via SSE (/api/overlay/stream/predictions) + polling
// fallback; renders the prediction card (top-center). Hidden when none open/locked.
// Visual in @/components/PredictionOverlayCard (shared with /admin#predictions preview).
import { PredictionOverlayCard, type PredictionOverlayOption } from "@/components/PredictionOverlayCard";
import { useOverlayStream } from "@/lib/use-overlay-stream";

type Feed =
  | { active: false }
  | {
      active: true;
      id: string;
      question: string;
      status: string;
      accentColor: string;
      totalPot: number;
      options: PredictionOverlayOption[];
    };

export function PredictionOverlayClient() {
  const { data: feed, status } = useOverlayStream<Feed>({ feed: "predictions", intervalMs: 4000 });

  if (status === "no-token") return <StatusBox msg="Missing ?token=<OVERLAY_TOKEN>" />;
  if (status === "unauthorized") return <StatusBox msg="Invalid token" />;
  if (!feed || !feed.active) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 24,
        left: "50%",
        transform: "translateX(-50%)",
        fontFamily: "'Inter', system-ui, sans-serif",
        pointerEvents: "none",
        zIndex: 999999,
      }}
    >
      <PredictionOverlayCard
        question={feed.question}
        options={feed.options}
        totalPot={feed.totalPot}
        accent={feed.accentColor}
        locked={feed.status === "locked"}
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
