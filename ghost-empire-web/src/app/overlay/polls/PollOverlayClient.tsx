"use client";
// src/app/overlay/polls/PollOverlayClient.tsx
// Polls /api/alerts/polls every 4s and renders the active poll card (top-center).
// Hidden when there's no open poll. Visual lives in @/components/PollOverlayCard.
import { useEffect, useState } from "react";
import { PollOverlayCard, type PollOverlayOption } from "@/components/PollOverlayCard";

const POLL_INTERVAL_MS = 4000;

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
  const [token, setToken] = useState<string | null>(null);
  const [authStatus, setAuthStatus] = useState<"idle" | "ok" | "unauthorized" | "no-token">("idle");
  const [feed, setFeed] = useState<Feed | null>(null);

  useEffect(() => {
    const t = new URL(window.location.href).searchParams.get("token");
    if (!t) { setAuthStatus("no-token"); return; }
    setToken(t);
  }, []);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch(`/api/alerts/polls?token=${encodeURIComponent(token)}`, { cache: "no-store" });
        if (cancelled) return;
        if (res.status === 401) { setAuthStatus("unauthorized"); return; }
        if (!res.ok) return;
        const d: Feed = await res.json();
        setFeed(d);
        setAuthStatus("ok");
      } catch {
        /* retry next tick */
      }
    };
    void poll();
    const id = setInterval(poll, POLL_INTERVAL_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, [token]);

  if (authStatus === "no-token") return <StatusBox msg="Missing ?token=<OVERLAY_TOKEN>" />;
  if (authStatus === "unauthorized") return <StatusBox msg="Invalid token" />;
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
