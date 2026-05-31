"use client";
// src/app/overlay/subathon/SubathonOverlayClient.tsx
// Polls /api/alerts/subathon every 3s (to catch extensions) and ticks locally every
// second. Countdown is drift-corrected against server time. The card visual lives in
// @/components/SubathonCard (shared with the /admin#subathon preview).
import { useEffect, useRef, useState } from "react";
import { SubathonCard } from "@/components/SubathonCard";

const POLL_INTERVAL_MS = 3000;

type Feed = { active: boolean; endsAt: string | null; serverNow: string };

export function SubathonOverlayClient() {
  const [token, setToken] = useState<string | null>(null);
  const [authStatus, setAuthStatus] = useState<"idle" | "ok" | "unauthorized" | "no-token">("idle");
  const [endsAtMs, setEndsAtMs] = useState<number | null>(null);
  const [active, setActive] = useState(false);
  const offsetRef = useRef(0); // localNow - serverNow
  const [, setTick] = useState(0); // forces a 1s re-render

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
        const res = await fetch(`/api/alerts/subathon?token=${encodeURIComponent(token)}`, { cache: "no-store" });
        if (cancelled) return;
        if (res.status === 401) { setAuthStatus("unauthorized"); return; }
        if (!res.ok) return;
        const d: Feed = await res.json();
        offsetRef.current = Date.now() - new Date(d.serverNow).getTime();
        setActive(d.active);
        setEndsAtMs(d.endsAt ? new Date(d.endsAt).getTime() : null);
        setAuthStatus("ok");
      } catch {
        /* retry next tick */
      }
    };
    void poll();
    const pollId = setInterval(poll, POLL_INTERVAL_MS);
    const tickId = setInterval(() => setTick((n) => n + 1), 1000);
    return () => { cancelled = true; clearInterval(pollId); clearInterval(tickId); };
  }, [token]);

  if (authStatus === "no-token") return <StatusBox msg="Missing ?token=<OVERLAY_TOKEN>" />;
  if (authStatus === "unauthorized") return <StatusBox msg="Invalid token" />;
  if (!active || endsAtMs == null) return null;

  const serverNow = Date.now() - offsetRef.current;
  const remainingMs = Math.max(0, endsAtMs - serverNow);
  const ended = remainingMs <= 0;

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
      <SubathonCard remainingMs={remainingMs} ended={ended} />
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
