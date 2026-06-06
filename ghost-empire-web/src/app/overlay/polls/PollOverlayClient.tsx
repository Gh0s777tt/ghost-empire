"use client";
// src/app/overlay/polls/PollOverlayClient.tsx
// Realtime active poll via SSE (/api/overlay/stream/polls) + polling fallback;
// renders the poll card (top-center). Hidden when no open poll. Visual in @/components/PollOverlayCard.
import { PollOverlayCard, type PollOverlayOption } from "@/components/PollOverlayCard";
import { useOverlayStream } from "@/lib/use-overlay-stream";

type Feed =
  | { active: false }
  | {
      active: true;
      id: string;
      question: string;
      status: string;
      accentColor: string;
      total: number;
      options: PollOverlayOption[];
    };

export function PollOverlayClient() {
  const { data: feed, status } = useOverlayStream<Feed>({ feed: "polls", intervalMs: 4000 });

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
      <PollOverlayCard
        question={feed.question}
        options={feed.options}
        total={feed.total}
        accent={feed.accentColor}
        closed={feed.status !== "open"}
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
