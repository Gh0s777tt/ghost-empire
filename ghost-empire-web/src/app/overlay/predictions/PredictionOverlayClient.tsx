"use client";
// src/app/overlay/predictions/PredictionOverlayClient.tsx
// Polls /api/alerts/predictions every 4s and renders the active prediction card
// (top-center). Hidden when there's no open/locked prediction. The visual lives in
// @/components/PredictionOverlayCard (shared with the /admin#predictions preview).
import { useEffect, useState } from "react";
import { PredictionOverlayCard, type PredictionOverlayOption } from "@/components/PredictionOverlayCard";

const POLL_INTERVAL_MS = 4000;

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
        const res = await fetch(`/api/alerts/predictions?token=${encodeURIComponent(token)}`, { cache: "no-store" });
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
