// src/components/ChatMessageRow.tsx
// Shared presentational chat row for the chat overlay — used by the OBS overlay
// (/overlay/chat) and the live preview in /admin#chat. Styled by ChatOverlayConfig.
import type { ReactNode } from "react";
import { WIDGET_FONTS, fontStack } from "@/lib/widget-fonts";

export type ChatMsg = {
  id: string;
  platform: string;
  username: string;
  message: string;
  emotes?: Record<string, string[]> | null; // Twitch: { emoteId: ["start-end", …] } (code points)
  badges?: Record<string, string> | null;    // Twitch: { moderator:"1", subscriber:"12", … }
  createdAt?: string;
};

// Lightweight emoji stand-ins for Twitch badges (real badge images need the Helix badge
// set; emoji keep it dependency-free and instantly recognizable).
const BADGE_EMOJI: Record<string, string> = {
  broadcaster: "📡", moderator: "🛡️", subscriber: "⭐", founder: "🥇", vip: "💎",
  premium: "👑", partner: "✅", staff: "🔧", admin: "🔧", "sub-gifter": "🎁",
  bits: "💠", "bits-leader": "💠", turbo: "⚡", artist: "🎨",
};

/** Renders chat text, swapping Twitch emote ranges for their CDN images. */
function renderMessage(message: string, emotes: ChatMsg["emotes"], fontSize: number, textColor: string): ReactNode {
  if (!emotes || Object.keys(emotes).length === 0) return message;

  const ranges: Array<{ start: number; end: number; id: string }> = [];
  for (const [id, positions] of Object.entries(emotes)) {
    if (!Array.isArray(positions)) continue;
    for (const pos of positions) {
      const [s, e] = String(pos).split("-").map(Number);
      if (Number.isInteger(s) && Number.isInteger(e) && e >= s) ranges.push({ start: s, end: e, id });
    }
  }
  if (ranges.length === 0) return message;
  ranges.sort((a, b) => a.start - b.start);

  const chars = [...message]; // code-point array (Twitch positions are code-point based)
  const out: ReactNode[] = [];
  let cursor = 0;
  let k = 0;
  const size = Math.round(fontSize * 1.45);
  for (const r of ranges) {
    if (r.start < cursor) continue; // skip overlaps
    if (r.start > cursor) out.push(<span key={k++} style={{ color: textColor }}>{chars.slice(cursor, r.start).join("")}</span>);
    out.push(
      <img
        key={k++}
        src={`https://static-cdn.jtvnw.net/emoticons/v2/${r.id}/default/dark/2.0`}
        alt={chars.slice(r.start, r.end + 1).join("")}
        style={{ height: size, verticalAlign: "middle", margin: "0 1px" }}
      />,
    );
    cursor = r.end + 1;
  }
  if (cursor < chars.length) out.push(<span key={k++} style={{ color: textColor }}>{chars.slice(cursor).join("")}</span>);
  return <>{out}</>;
}

export type ChatOverlayCfg = {
  fontSize: number;
  textColor: string;
  fontFamily: string;
  bgOpacity: number;
  showPlatformIcon: boolean;
};

export const DEFAULT_CHAT_CFG: ChatOverlayCfg = {
  fontSize: 15,
  textColor: "#e4e4e7",
  fontFamily: "Inter",
  bgOpacity: 0.85,
  showPlatformIcon: true,
};

// Same font set as the widget generator (single source of truth in lib/widget-fonts).
export const CHAT_FONTS: Record<string, string> = Object.fromEntries(WIDGET_FONTS.map((f) => [f.value, f.stack]));

export const PLATFORM_COLOR: Record<string, string> = {
  twitch: "#9146FF",
  kick: "#53FC18",
  youtube: "#FF0000",
};

export const PLATFORM_ICON: Record<string, string> = {
  twitch: "🟣",
  kick: "🟢",
  youtube: "🔴",
};

export function ChatMessageRow({ msg, cfg = DEFAULT_CHAT_CFG }: { msg: ChatMsg; cfg?: ChatOverlayCfg }) {
  const color = PLATFORM_COLOR[msg.platform] ?? "#888888";
  const font = fontStack(cfg.fontFamily);
  const badgeStr = msg.badges ? Object.keys(msg.badges).map((b) => BADGE_EMOJI[b]).filter(Boolean).join(" ") : "";
  return (
    <div
      style={{
        background: `rgba(15, 15, 20, ${cfg.bgOpacity})`,
        backdropFilter: "blur(8px)",
        borderRadius: 8,
        padding: "6px 12px",
        borderLeft: `3px solid ${color}`,
        boxShadow: "0 4px 14px rgba(0,0,0,0.45)",
        color: "#fff",
        fontSize: cfg.fontSize,
        lineHeight: 1.35,
        wordBreak: "break-word",
        fontFamily: font,
      }}
    >
      {cfg.showPlatformIcon && (
        <span style={{ fontSize: Math.round(cfg.fontSize * 0.73), marginRight: 5 }}>{PLATFORM_ICON[msg.platform] ?? ""}</span>
      )}
      {badgeStr && <span style={{ marginRight: 4 }}>{badgeStr}</span>}
      <span style={{ fontWeight: 800, color }}>{msg.username}</span>
      <span style={{ color: "#71717a", margin: "0 6px" }}>:</span>
      <span style={{ color: cfg.textColor }}>{renderMessage(msg.message, msg.emotes, cfg.fontSize, cfg.textColor)}</span>
    </div>
  );
}
