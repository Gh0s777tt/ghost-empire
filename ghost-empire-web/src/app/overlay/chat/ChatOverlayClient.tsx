"use client";
// src/app/overlay/chat/ChatOverlayClient.tsx
// Realtime chat via SSE (/api/overlay/stream/chat) + polling fallback; renders the
// latest messages bottom-aligned. Row visual in @/components/ChatMessageRow (shared with /admin#chat).
import { useEffect, useState } from "react";
import { ChatMessageRow, DEFAULT_CHAT_CFG, type ChatMsg, type ChatOverlayCfg, type ChatAssets } from "@/components/ChatMessageRow";
import { useOverlayStream } from "@/lib/use-overlay-stream";

const ASSETS_REFRESH_MS = 5 * 60_000; // badge/emote maps change rarely

type ChatFeed = { messages: ChatMsg[]; config?: ChatOverlayCfg };

export function ChatOverlayClient() {
  const { data, status } = useOverlayStream<ChatFeed>({ feed: "chat", intervalMs: 2000 });
  const [token, setToken] = useState<string | null>(null);
  const [assets, setAssets] = useState<ChatAssets | undefined>(undefined);

  // Token for the separate badge/emote assets fetch below (the message feed reads it internally).
  useEffect(() => {
    setToken(new URL(window.location.href).searchParams.get("token"));
  }, []);

  // Load real Twitch badges + 7TV/BTTV/FFZ emotes once, then refresh occasionally.
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    const loadAssets = async () => {
      try {
        const res = await fetch(`/api/chat/assets?token=${encodeURIComponent(token)}`, { cache: "no-store" });
        if (!cancelled && res.ok) setAssets(await res.json());
      } catch {
        /* keep previous assets — falls back to emoji/text */
      }
    };
    void loadAssets();
    const interval = setInterval(loadAssets, ASSETS_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [token]);

  if (status === "no-token") return <StatusBox msg="Missing ?token=<OVERLAY_TOKEN>" />;
  if (status === "unauthorized") return <StatusBox msg="Invalid token" />;

  const messages = data?.messages ?? [];
  const cfg = data?.config ?? DEFAULT_CHAT_CFG;

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
        <ChatMessageRow key={m.id} msg={m} cfg={cfg} assets={assets} />
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
