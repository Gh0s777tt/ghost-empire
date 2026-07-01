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

// Shared asset maps supplied by /api/chat/assets (real Twitch badge art + 7TV/BTTV/FFZ
// emotes). Optional everywhere — when absent we fall back to emoji badges / plain text.
export type ChatBadges = Record<string, string>;                        // "setId/version" -> image url
export type ThirdPartyEmote = { url: string; zeroWidth?: boolean };
export type ThirdPartyEmotes = Record<string, ThirdPartyEmote>;         // emote name -> image info
export type ChatAssets = { badges: ChatBadges; emotes: ThirdPartyEmotes };

// Emoji stand-ins for Twitch badges — used only when real badge art isn't loaded yet
// (or for a badge set the Helix response didn't include).
const BADGE_EMOJI: Record<string, string> = {
  broadcaster: "📡", moderator: "🛡️", subscriber: "⭐", founder: "🥇", vip: "💎",
  premium: "👑", partner: "✅", staff: "🔧", admin: "🔧", "sub-gifter": "🎁",
  bits: "💠", "bits-leader": "💠", turbo: "⚡", artist: "🎨",
};

/** Renders a run of plain text, swapping any 7TV/BTTV/FFZ emote names for their images. */
function renderText(
  text: string,
  emotes: ThirdPartyEmotes | undefined,
  size: number,
  textColor: string,
  key: { n: number },
): ReactNode[] {
  if (!text) return [];
  if (!emotes || Object.keys(emotes).length === 0) {
    return [<span key={key.n++} style={{ color: textColor }}>{text}</span>];
  }
  const out: ReactNode[] = [];
  // Split on whitespace but keep it, so spacing between words/emotes is preserved.
  for (const tok of text.split(/(\s+)/)) {
    if (!tok) continue;
    const emote = emotes[tok];
    if (emote) {
      out.push(
        <img
          key={key.n++}
          src={emote.url}
          alt={tok}
          title={tok}
          style={{ height: size, verticalAlign: "middle", margin: "0 1px" }} loading="lazy" decoding="async" />,
      );
    } else {
      out.push(<span key={key.n++} style={{ color: textColor }}>{tok}</span>);
    }
  }
  return out;
}

/** Renders chat text: Twitch emote ranges → CDN images, plus 7TV/BTTV/FFZ names → images. */
function renderMessage(
  message: string,
  emotes: ChatMsg["emotes"],
  thirdParty: ThirdPartyEmotes | undefined,
  fontSize: number,
  textColor: string,
): ReactNode {
  const size = Math.round(fontSize * 1.45);
  const key = { n: 0 };

  const ranges: Array<{ start: number; end: number; id: string }> = [];
  if (emotes) {
    for (const [id, positions] of Object.entries(emotes)) {
      if (!Array.isArray(positions)) continue;
      for (const pos of positions) {
        const [s, e] = String(pos).split("-").map(Number);
        if (Number.isInteger(s) && Number.isInteger(e) && e >= s) ranges.push({ start: s, end: e, id });
      }
    }
  }

  // No native Twitch emotes → just scan the whole message for third-party emotes.
  if (ranges.length === 0) {
    return <>{renderText(message, thirdParty, size, textColor, key)}</>;
  }

  ranges.sort((a, b) => a.start - b.start);
  const chars = [...message]; // code-point array (Twitch positions are code-point based)
  const out: ReactNode[] = [];
  let cursor = 0;
  for (const r of ranges) {
    if (r.start < cursor) continue; // skip overlaps
    if (r.start > cursor) out.push(...renderText(chars.slice(cursor, r.start).join(""), thirdParty, size, textColor, key));
    out.push(
      <img
        key={key.n++}
        src={`https://static-cdn.jtvnw.net/emoticons/v2/${r.id}/default/dark/2.0`}
        alt={chars.slice(r.start, r.end + 1).join("")}
        style={{ height: size, verticalAlign: "middle", margin: "0 1px" }} loading="lazy" decoding="async" />,
    );
    cursor = r.end + 1;
  }
  if (cursor < chars.length) out.push(...renderText(chars.slice(cursor).join(""), thirdParty, size, textColor, key));
  return <>{out}</>;
}

/** Renders a user's badges: real Twitch badge art when loaded, else emoji fallback. */
function renderBadges(badges: ChatMsg["badges"], assetBadges: ChatBadges | undefined, fontSize: number): ReactNode {
  if (!badges) return null;
  const size = Math.round(fontSize * 1.1);
  const nodes: ReactNode[] = [];
  for (const [setId, version] of Object.entries(badges)) {
    const url = assetBadges?.[`${setId}/${version}`];
    if (url) {
      nodes.push(
        <img key={setId} src={url} alt={setId} title={setId}
          style={{ height: size, verticalAlign: "middle", marginRight: 3 }} loading="lazy" decoding="async" />,
      );
    } else if (BADGE_EMOJI[setId]) {
      nodes.push(<span key={setId} style={{ marginRight: 3 }}>{BADGE_EMOJI[setId]}</span>);
    }
  }
  if (nodes.length === 0) return null;
  return <span style={{ marginRight: 2 }}>{nodes}</span>;
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

export function ChatMessageRow({
  msg,
  cfg = DEFAULT_CHAT_CFG,
  assets,
}: {
  msg: ChatMsg;
  cfg?: ChatOverlayCfg;
  assets?: ChatAssets;
}) {
  const color = PLATFORM_COLOR[msg.platform] ?? "#888888";
  const font = fontStack(cfg.fontFamily);
  const badges = renderBadges(msg.badges, assets?.badges, cfg.fontSize);
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
      {badges}
      <span style={{ fontWeight: 800, color }}>{msg.username}</span>
      <span style={{ color: "#71717a", margin: "0 6px" }}>:</span>
      <span style={{ color: cfg.textColor }}>{renderMessage(msg.message, msg.emotes, assets?.emotes, cfg.fontSize, cfg.textColor)}</span>
    </div>
  );
}
