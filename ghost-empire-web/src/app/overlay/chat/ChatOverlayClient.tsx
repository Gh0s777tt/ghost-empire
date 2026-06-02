"use client";
// src/app/overlay/chat/ChatOverlayClient.tsx
// Polls /api/alerts/chat every 2s, renders the latest messages bottom-aligned.
// The row visual lives in @/components/ChatMessageRow (shared with /admin#chat preview).
import { useEffect, useState } from "react";
import { ChatMessageRow, DEFAULT_CHAT_CFG, type ChatMsg, type ChatOverlayCfg } from "@/components/ChatMessageRow";

const POLL_INTERVAL_MS = 2000;

export function ChatOverlayClient() {
  const [token, setToken] = useState<string | null>(null);
  const [authStatus, setAuthStatus] = useState<"idle" | "ok" | "unauthorized" | "no-token">("idle");
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [cfg, setCfg] = useState<ChatOverlayCfg>(DEFAULT_CHAT_CFG);

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
        const json: { messages: ChatMsg[]; config?: ChatOverlayCfg } = await res.json();
        setMessages(json.messages ?? []);
        if (json.config) setCfg(json.config);
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
      {messages.map((m) => (
        <ChatMessageRow key={m.id} msg={m} cfg={cfg} />
      ))}
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
