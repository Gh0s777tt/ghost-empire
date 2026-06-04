"use client";
// src/app/overlay/viewers/ViewersOverlayClient.tsx
// Polls /api/alerts/viewers every 20s and shows a small "👁 N" badge while the
// streamer is live. Hidden when offline / not configured.
import { useEffect, useState } from "react";

const POLL_INTERVAL_MS = 20_000;

type Feed = { live: boolean; configured?: boolean; viewers?: number; game?: string | null };

export function ViewersOverlayClient() {
  const [token, setToken] = useState<string | null>(null);
  const [accent, setAccent] = useState("#E50914");
  const [authStatus, setAuthStatus] = useState<"idle" | "ok" | "unauthorized" | "no-token">("idle");
  const [feed, setFeed] = useState<Feed | null>(null);

  useEffect(() => {
    const params = new URL(window.location.href).searchParams;
    const t = params.get("token");
    if (!t) { setAuthStatus("no-token"); return; }
    setToken(t);
    const a = params.get("accent");
    if (a && /^[0-9a-fA-F]{6}$/.test(a)) setAccent(`#${a}`);
  }, []);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch(`/api/alerts/viewers?token=${encodeURIComponent(token)}`, { cache: "no-store" });
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
  if (!feed || !feed.live || typeof feed.viewers !== "number") return null;

  return (
    <div style={{ position: "fixed", top: 16, left: 16, zIndex: 999999, pointerEvents: "none" }}>
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          background: "rgba(15, 15, 20, 0.92)",
          backdropFilter: "blur(10px)",
          borderRadius: 999,
          padding: "7px 14px",
          border: `2px solid ${accent}`,
          boxShadow: `0 8px 24px rgba(0,0,0,0.5), 0 0 16px ${accent}55`,
          color: "#fff",
          fontFamily: "'Inter', system-ui, sans-serif",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        <span style={{ fontSize: 16 }}>👁</span>
        <span style={{ fontSize: 18, fontWeight: 800 }}>{feed.viewers.toLocaleString("pl-PL")}</span>
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
