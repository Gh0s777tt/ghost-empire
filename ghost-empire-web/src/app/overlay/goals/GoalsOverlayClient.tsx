"use client";
// src/app/overlay/goals/GoalsOverlayClient.tsx
// Realtime goals via SSE (/api/overlay/stream/goals) + polling fallback; renders
// animated progress bars + hype train banner. Visual pieces in @/components/GoalBar.
import { GoalBar, HypeTrainBanner, type OverlayGoal, type OverlayHypeTrain } from "@/components/GoalBar";
import { useOverlayStream } from "@/lib/use-overlay-stream";

type FeedResponse = {
  accentColor: string;
  goals: OverlayGoal[];
  hypeTrain: OverlayHypeTrain | null;
};

export function GoalsOverlayClient() {
  const { data, status } = useOverlayStream<FeedResponse>({ feed: "goals", intervalMs: 2000 });

  if (status === "no-token") return <StatusBox msg="Missing ?token=<OVERLAY_TOKEN>" />;
  if (status === "unauthorized") return <StatusBox msg="Invalid token" />;
  if (!data) return null;

  const accent = data.accentColor;

  return (
    <div
      style={{
        position: "fixed",
        top: 24,
        left: 24,
        right: 24,
        pointerEvents: "none",
        fontFamily: "'Inter', system-ui, sans-serif",
        display: "flex",
        flexDirection: "column",
        gap: 10,
        zIndex: 999999,
      }}
    >
      {/* Hype train banner — only when active */}
      {data.hypeTrain && <HypeTrainBanner train={data.hypeTrain} accent={accent} />}

      {/* Goals stack — bottom-left */}
      <div
        style={{
          position: "fixed",
          left: 24,
          bottom: 24,
          width: 360,
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        {data.goals.map((g) => (
          <GoalBar key={g.id} goal={g} accent={accent} />
        ))}
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
