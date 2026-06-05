"use client";
// src/app/overlay/emoji-combo/EmojiComboOverlayClient.tsx
// Polls /api/alerts/emoji-combo every ~1.5s and pops a big emoji + "xN COMBO!" while a
// combo is fresh. Re-animates whenever a new combo (different ts) arrives.
import { useEffect, useState } from "react";

const POLL_INTERVAL_MS = 1500;

type Feed = { active: boolean; emoji?: string; count?: number; ts?: number };

export function EmojiComboOverlayClient() {
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
        const res = await fetch(`/api/alerts/emoji-combo?token=${encodeURIComponent(token)}`, { cache: "no-store" });
        if (cancelled) return;
        if (res.status === 401) { setAuthStatus("unauthorized"); return; }
        if (!res.ok) return;
        setFeed(await res.json());
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
  if (!feed || !feed.active || !feed.emoji) return null;

  return (
    <div
      style={{
        position: "fixed",
        left: "50%",
        bottom: 80,
        transform: "translateX(-50%)",
        zIndex: 999999,
        pointerEvents: "none",
        fontFamily: "'Anton', 'Inter', system-ui, sans-serif",
      }}
    >
      {/* key on ts so each new combo restarts the pop animation */}
      <div
        key={feed.ts}
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 4,
          animation: "ge-combo-pop 360ms cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      >
        <div style={{ fontSize: 96, lineHeight: 1, animation: "ge-combo-pulse 700ms ease-in-out infinite", filter: "drop-shadow(0 6px 16px rgba(0,0,0,0.6))" }}>
          {feed.emoji}
        </div>
        <div
          style={{
            fontSize: 40,
            fontWeight: 900,
            color: "#fff",
            letterSpacing: 2,
            textShadow: "0 0 14px #E50914, 0 3px 10px rgba(0,0,0,0.85)",
            WebkitTextStroke: "1px rgba(0,0,0,0.4)",
          }}
        >
          ×{feed.count} COMBO!
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
