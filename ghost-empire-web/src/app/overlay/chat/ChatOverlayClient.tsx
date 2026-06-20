"use client";
// src/app/overlay/chat/ChatOverlayClient.tsx
// Realtime chat via SSE (/api/overlay/stream/chat) + polling fallback; renders the
// latest messages bottom-aligned. Row visual in @/components/ChatMessageRow (shared with /admin#chat).
import { useEffect, useState } from "react";
import { ChatMessageRow, DEFAULT_CHAT_CFG, type ChatMsg, type ChatOverlayCfg, type ChatAssets } from "@/components/ChatMessageRow";
import { useOverlayStream } from "@/lib/use-overlay-stream";
import { shouldTranslate } from "@/lib/chat-translate";

const ASSETS_REFRESH_MS = 5 * 60_000; // badge/emote maps change rarely

type ChatFeed = { messages: ChatMsg[]; config?: ChatOverlayCfg };

// Client cache of translations (target|text → translation). The chat feed re-renders
// every poll with the SAME messages; keying rows by id keeps React instances alive so
// effects run once per message, and this cache dedupes identical text across ids.
const trCache = new Map<string, string>();

// One translatable message → its AI translation shown muted under the original (#547).
// Active only when the OBS source URL carries ?translate=<lang>; dormant otherwise.
function TranslatedRow({ msg, cfg, assets, target }: { msg: ChatMsg; cfg: ChatOverlayCfg; assets: ChatAssets | undefined; target: string }) {
  const cacheKey = `${target}|${msg.message}`;
  const [tr, setTr] = useState<string | null>(() => trCache.get(cacheKey) ?? null);

  useEffect(() => {
    if (tr || !target || !shouldTranslate(msg.message)) return;
    if (trCache.has(cacheKey)) { setTr(trCache.get(cacheKey)!); return; }
    let cancelled = false;
    fetch("/api/chat/translate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: msg.message, target }) })
      .then((r) => r.json())
      .then((d: { translated?: string | null }) => {
        if (cancelled || !d?.translated) return;
        trCache.set(cacheKey, d.translated);
        setTr(d.translated);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [msg.id, msg.message, target, tr, cacheKey]);

  return (
    <div>
      <ChatMessageRow msg={msg} cfg={cfg} assets={assets} />
      {tr && (
        <div style={{ fontSize: 13, lineHeight: 1.3, color: "rgba(255,255,255,0.6)", fontStyle: "italic", marginInlineStart: 10, marginTop: -1 }}>↳ {tr}</div>
      )}
    </div>
  );
}

export function ChatOverlayClient() {
  const { data, status } = useOverlayStream<ChatFeed>({ feed: "chat", intervalMs: 2000 });
  const [token, setToken] = useState<string | null>(null);
  const [translate, setTranslate] = useState<string>("");
  const [assets, setAssets] = useState<ChatAssets | undefined>(undefined);

  // Token + optional ?translate=<lang> from the OBS source URL.
  useEffect(() => {
    const sp = new URL(window.location.href).searchParams;
    setToken(sp.get("token"));
    setTranslate((sp.get("translate") || "").toLowerCase().slice(0, 5));
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
      {messages.map((m) =>
        translate ? (
          <TranslatedRow key={m.id} msg={m} cfg={cfg} assets={assets} target={translate} />
        ) : (
          <ChatMessageRow key={m.id} msg={m} cfg={cfg} assets={assets} />
        ),
      )}
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
