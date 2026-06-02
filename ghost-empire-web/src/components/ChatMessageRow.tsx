// src/components/ChatMessageRow.tsx
// Shared presentational chat row for the chat overlay — used by the OBS overlay
// (/overlay/chat) and the live preview in /admin#chat. Styled by ChatOverlayConfig.

export type ChatMsg = {
  id: string;
  platform: string;
  username: string;
  message: string;
  createdAt?: string;
};

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

export const CHAT_FONTS: Record<string, string> = {
  Inter: "'Inter', system-ui, sans-serif",
  "JetBrains Mono": "'JetBrains Mono', ui-monospace, monospace",
  Anton: "'Anton', system-ui, sans-serif",
  system: "system-ui, sans-serif",
};

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
  const font = CHAT_FONTS[cfg.fontFamily] ?? CHAT_FONTS.Inter;
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
      <span style={{ fontWeight: 800, color }}>{msg.username}</span>
      <span style={{ color: "#71717a", margin: "0 6px" }}>:</span>
      <span style={{ color: cfg.textColor }}>{msg.message}</span>
    </div>
  );
}
