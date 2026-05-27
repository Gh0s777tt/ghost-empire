"use client";
// src/app/overlay/goals/GoalsOverlayClient.tsx
// Polls /api/alerts/goals every 2s, renders animated progress bars + hype train banner.
import { useEffect, useState } from "react";

const POLL_INTERVAL_MS = 2000;

type Goal = {
  id: string;
  type: string;
  label: string;
  current: number;
  target: number;
  color: string | null;
  completedAt: string | null;
};

type HypeTrain = {
  level: number;
  goal: number;
  total: number;
  topContributor: string | null;
  expiresAt: string | null;
};

type FeedResponse = {
  accentColor: string;
  goals: Goal[];
  hypeTrain: HypeTrain | null;
};

const TYPE_LABEL: Record<string, string> = {
  subs:           "Subskrypcje",
  gift_subs:      "Gifted Subs",
  follows:        "Follows",
  donations_pln:  "Donacje PLN",
  cheers_bits:    "Bity",
  yt_members:     "YT Members",
};

const TYPE_ICON: Record<string, string> = {
  subs:           "💜",
  gift_subs:      "🎁",
  follows:        "❤️",
  donations_pln:  "💰",
  cheers_bits:    "💎",
  yt_members:     "📺",
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

  if (authStatus === "no-token") {
    return <StatusBox msg="Missing ?token=<OVERLAY_TOKEN>" />;
  }
  if (authStatus === "unauthorized") {
    return <StatusBox msg="Invalid token" />;
  }
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

function GoalBar({ goal, accent }: { goal: Goal; accent: string }) {
  const color = goal.color ?? accent;
  const pct = Math.min(100, (goal.current / Math.max(1, goal.target)) * 100);
  const completed = goal.completedAt != null;

  return (
    <div
      style={{
        background: "rgba(15, 15, 20, 0.92)",
        backdropFilter: "blur(10px)",
        borderRadius: 10,
        padding: "10px 14px",
        borderLeft: `4px solid ${color}`,
        boxShadow: `0 10px 28px rgba(0,0,0,0.55), 0 0 14px ${color}33`,
        color: "#fff",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 18 }}>{TYPE_ICON[goal.type] ?? "🎯"}</span>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color }}>
              {TYPE_LABEL[goal.type] ?? goal.type}
              {completed && <span style={{ marginLeft: 6, color: "#34d399" }}>✓ COMPLETE</span>}
            </div>
            <div style={{ fontSize: 11, color: "#a1a1aa", lineHeight: 1.2 }}>{goal.label}</div>
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: "#fff", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
            {goal.current.toLocaleString("pl-PL")}
            <span style={{ color: "#71717a", fontWeight: 500, fontSize: 11 }}> / {goal.target.toLocaleString("pl-PL")}</span>
          </div>
          <div style={{ fontSize: 10, color: "#a1a1aa", fontVariantNumeric: "tabular-nums" }}>
            {pct.toFixed(0)}%
          </div>
        </div>
      </div>
      <div style={{ height: 6, background: "rgba(255,255,255,0.08)", borderRadius: 3, overflow: "hidden" }}>
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            background: completed
              ? "linear-gradient(90deg, #34d399, #10b981)"
              : `linear-gradient(90deg, ${color}, ${color}cc)`,
            transition: "width 600ms cubic-bezier(0.22, 1, 0.36, 1)",
            boxShadow: `0 0 10px ${color}88`,
          }}
        />
      </div>
    </div>
  );
}

function HypeTrainBanner({ train, accent }: { train: HypeTrain; accent: string }) {
  const pct = Math.min(100, (train.total / Math.max(1, train.goal)) * 100);
  return (
    <div
      style={{
        background: "rgba(20, 10, 30, 0.95)",
        backdropFilter: "blur(10px)",
        borderRadius: 12,
        padding: "12px 18px",
        border: `2px solid ${accent}`,
        boxShadow: `0 12px 36px rgba(0,0,0,0.6), 0 0 20px ${accent}66`,
        color: "#fff",
        display: "flex",
        alignItems: "center",
        gap: 14,
      }}
    >
      <span style={{ fontSize: 28, animation: "pulse 1.4s ease-in-out infinite" }}>🚂</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: 0.5, color: accent }}>
          HYPE TRAIN — LEVEL {train.level}
        </div>
        <div style={{ height: 6, marginTop: 4, background: "rgba(255,255,255,0.08)", borderRadius: 3, overflow: "hidden" }}>
          <div
            style={{
              width: `${pct}%`,
              height: "100%",
              background: `linear-gradient(90deg, ${accent}, #fbbf24)`,
              transition: "width 400ms ease-out",
              boxShadow: `0 0 12px ${accent}`,
            }}
          />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 3, fontSize: 11, color: "#a1a1aa" }}>
          <span>{train.total.toLocaleString("pl-PL")} / {train.goal.toLocaleString("pl-PL")} pkt</span>
          {train.topContributor && <span>Top: {train.topContributor}</span>}
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
