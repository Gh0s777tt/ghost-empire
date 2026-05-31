"use client";
// src/app/overlay/codes/CodesOverlayClient.tsx
// Polls /api/codes/current every 3s; the server rotates the code on its own
// interval, so the client just renders whatever code is current and animates on
// change.
import { useEffect, useRef, useState } from "react";
import { CodeCard } from "@/components/CodeCard";

const POLL_INTERVAL_MS = 3000;

type Feed = {
  enabled: boolean;
  title?: string;
  accentColor?: string;
  code?: { id: string; code: string; label: string | null } | null;
};

export function CodesOverlayClient() {
  const [token, setToken] = useState<string | null>(null);
  const [authStatus, setAuthStatus] = useState<"idle" | "ok" | "unauthorized" | "no-token">("idle");
  const [feed, setFeed] = useState<Feed | null>(null);
  const [visible, setVisible] = useState(false);
  const lastIdRef = useRef<string | null>(null);

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
        const res = await fetch(`/api/codes/current?token=${encodeURIComponent(token)}`, { cache: "no-store" });
        if (cancelled) return;
        if (res.status === 401) { setAuthStatus("unauthorized"); return; }
        if (!res.ok) return;
        const d: Feed = await res.json();
        setAuthStatus("ok");
        setFeed(d);
        const id = d.enabled ? d.code?.id ?? null : null;
        if (id !== lastIdRef.current) {
          // Code changed (or turned off) — fade out, swap, fade in.
          setVisible(false);
          lastIdRef.current = id;
          if (id) setTimeout(() => { if (!cancelled) setVisible(true); }, 220);
        }
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
  if (!feed?.enabled || !feed.code) return null;

  return (
    <div
      style={{
        position: "fixed",
        right: 32,
        bottom: 32,
        pointerEvents: "none",
        zIndex: 999999,
        transform: visible ? "translateY(0)" : "translateY(20px)",
        opacity: visible ? 1 : 0,
        transition: "transform 360ms cubic-bezier(0.22, 1, 0.36, 1), opacity 280ms ease",
      }}
    >
      <CodeCard
        title={feed.title ?? "Kod"}
        label={feed.code.label}
        code={feed.code.code}
        accent={feed.accentColor ?? "#10b981"}
        scaleOrigin="bottom right"
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
