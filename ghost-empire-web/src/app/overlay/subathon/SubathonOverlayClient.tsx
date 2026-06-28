"use client";
// src/app/overlay/subathon/SubathonOverlayClient.tsx
// Realtime subathon via SSE (/api/overlay/stream/subathon) + polling fallback; ticks
// locally every second with a drift-corrected countdown vs server time. Card visual in
// @/components/SubathonCard (shared with the /admin#subathon preview).
import { useEffect, useRef, useState } from "react";
import { SubathonCard } from "@/components/SubathonCard";
import { useOverlayStream } from "@/lib/use-overlay-stream";

type Feed = { active: boolean; endsAt: string | null; accentColor?: string; label?: string; serverNow: string };

export function SubathonOverlayClient() {
  const { data, status } = useOverlayStream<Feed>({ feed: "subathon", intervalMs: 3000 });
  const offsetRef = useRef(0); // localNow - serverNow
  const [, setTick] = useState(0); // forces a 1s re-render

  // Re-sync the drift offset whenever a fresh payload arrives.
  useEffect(() => {
    if (data?.serverNow) offsetRef.current = Date.now() - new Date(data.serverNow).getTime();
  }, [data]);

  // Local 1s tick so the countdown keeps ticking down between server updates.
  useEffect(() => {
    const tickId = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(tickId);
  }, []);

  if (status === "no-token") return <StatusBox msg="Missing ?token=<OVERLAY_TOKEN>" />;
  if (status === "unauthorized") return <StatusBox msg="Invalid token" />;
  const endsAtMs = data?.endsAt ? new Date(data.endsAt).getTime() : null;
  if (!data?.active || endsAtMs == null) return null;

  // eslint-disable-next-line react-hooks/purity, react-hooks/refs -- live drift-corrected countdown: reads Date.now() + offsetRef each render BY DESIGN (a 1s tick drives it); compiler bails out safely (#733)
  const serverNow = Date.now() - offsetRef.current;
  const remainingMs = Math.max(0, endsAtMs - serverNow);
  const ended = remainingMs <= 0;
  const accent = data.accentColor ?? "#E50914";
  const label = data.label ?? "Subathon";

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
      <SubathonCard remainingMs={remainingMs} ended={ended} accent={accent} label={label} />
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
