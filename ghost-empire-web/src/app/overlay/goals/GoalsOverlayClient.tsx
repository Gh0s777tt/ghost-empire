"use client";
// src/app/overlay/goals/GoalsOverlayClient.tsx
// Polls /api/alerts/goals every 2s, renders animated progress bars + hype train banner.
// Visual pieces live in @/components/GoalBar (shared with the /admin#goals preview).
import { useEffect, useState } from "react";
import { GoalBar, HypeTrainBanner, type OverlayGoal, type OverlayHypeTrain } from "@/components/GoalBar";

const POLL_INTERVAL_MS = 2000;

type FeedResponse = {
  accentColor: string;
  goals: OverlayGoal[];
  hypeTrain: OverlayHypeTrain | null;
};

export function GoalsOverlayClient() {
  const [token, setToken] = useState<string | null>(null);
  const [authStatus, setAuthStatus] = useState<"idle" | "ok" | "unauthorized" | "no-token">("idle");
  const [data, setData] = useState<FeedResponse | null>(null);

  useEffect(() => {
    const url = new URL(window.location.href);
    const t = url.searchParams.get("token");
    if (!t) { setAuthStatus("no-token"); return; }
    setToken(t);
  }, []);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch(`/api/alerts/goals?token=${encodeURIComponent(token)}`, { cache: "no-store" });
        if (cancelled) return;
        if (res.status === 401) { setAuthStatus("unauthorized"); return; }
        if (!res.ok) return;
        const json: FeedResponse = await res.json();
        setData(json);
        setAuthStatus("ok");
      } catch {
        /* swallow — try next tick */
      }
    };
    void poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => { cancelled = true; clearInterval(interval); };
  }, [token]);

  if (authStatus === "no-token") return <StatusBox msg="Missing ?token=<OVERLAY_TOKEN>" />;
  if (authStatus === "unauthorized") return <StatusBox msg="Invalid token" />;
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
