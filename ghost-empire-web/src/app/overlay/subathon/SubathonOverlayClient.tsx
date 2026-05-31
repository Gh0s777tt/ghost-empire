"use client";
// src/app/overlay/subathon/SubathonOverlayClient.tsx
// Polls /api/alerts/subathon every 3s (to catch extensions) and ticks locally every
// second. Countdown is drift-corrected against server time.
import { useEffect, useRef, useState } from "react";

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
      <div
        style={{
          background: "rgba(15, 15, 20, 0.92)",
          backdropFilter: "blur(10px)",
          borderRadius: 14,
          padding: "12px 28px",
          border: "2px solid #E50914",
          boxShadow: "0 12px 36px rgba(0,0,0,0.6), 0 0 22px rgba(229,9,20,0.45)",
          color: "#fff",
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 3, color: "#E50914", textTransform: "uppercase" }}>
          {ended ? "Subathon — koniec!" : "Subathon"}
        </div>
        <div style={{ fontSize: 46, fontWeight: 900, fontVariantNumeric: "tabular-nums", lineHeight: 1.1, marginTop: 2 }}>
          {formatRemaining(remainingMs)}
        </div>
      </div>
    </div>
  );
}

function formatRemaining(ms: number): string {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
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
