"use client";
// src/app/overlay/chat/ChatOverlayClient.tsx
// Polls /api/alerts/chat every 2s, renders the latest messages bottom-aligned.
import { useEffect, useState } from "react";

const POLL_INTERVAL_MS = 2000;

type Msg = {
  id: string;
  platform: string;
  username: string;
  message: string;
  createdAt: string;
};

const PLATFORM_COLOR: Record<string, string> = {
  twitch: "#9146FF",
  kick: "#53FC18",
  youtube: "#FF0000",
};
const PLATFORM_ICON: Record<string, string> = {
  twitch: "🟣",
  kick: "🟢",
  youtube: "🔴",
};

export function ChatOverlayClient() {
  const [token, setToken] = useState<string | null>(null);
  const [authStatus, setAuthStatus] = useState<"idle" | "ok" | "unauthorized" | "no-token">("idle");
  const [messages, setMessages] = useState<Msg[]>([]);

  useEffect(() => {
    const t = new URL(window.location.href).searchParams.get("token");
    if (!t) {
      setAuthStatus("no-token");
      return;
    }
    setToken(t);
  }, []);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch(`/api/alerts/chat?token=${encodeURIComponent(token)}`, { cache: "no-store" });
        if (cancelled) return;
        if (res.status === 401) {
          setAuthStatus("unauthorized");
          return;
        }
        if (!res.ok) return;
        const json: { messages: Msg[] } = await res.json();
        setMessages(json.messages ?? []);
        setAuthStatus("ok");
      } catch {
        /* swallow — retry next tick */
      }
    };
    void poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [token]);

  if (authStatus === "no-token") return <StatusBox msg="Missing ?token=<OVERLAY_TOKEN>" />;
  if (authStatus === "unauthorized") return <StatusBox msg="Invalid token" />;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
        padding: 16,
        gap: 6,
        fontFamily: "'Inter', system-ui, sans-serif",
        pointerEvents: "none",
        overflow: "hidden",
      }}
    >
      {messages.map((m) => {
        const color = PLATFORM_COLOR[m.platform] ?? "#888888";
        return (
          <div
            key={m.id}
            style={{
              background: "rgba(15, 15, 20, 0.85)",
              backdropFilter: "blur(8px)",
              borderRadius: 8,
              padding: "6px 12px",
              borderLeft: `3px solid ${color}`,
              boxShadow: "0 4px 14px rgba(0,0,0,0.45)",
              color: "#fff",
              fontSize: 15,
              lineHeight: 1.35,
              wordBreak: "break-word",
            }}
          >
            <span style={{ fontSize: 11, marginRight: 5 }}>{PLATFORM_ICON[m.platform] ?? ""}</span>
            <span style={{ fontWeight: 800, color }}>{m.username}</span>
            <span style={{ color: "#71717a", margin: "0 6px" }}>:</span>
            <span style={{ color: "#e4e4e7" }}>{m.message}</span>
          </div>
        );
      })}
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
