// src/components/ChatMessageRow.tsx
// Shared presentational chat row for the chat overlay — used by the OBS overlay
// (/overlay/chat) and the live preview in /admin#chat.

export type ChatMsg = {
  id: string;
  platform: string;
  username: string;
  message: string;
  createdAt?: string;
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

export function ChatMessageRow({ msg }: { msg: ChatMsg }) {
  const color = PLATFORM_COLOR[msg.platform] ?? "#888888";
  return (
    <div
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
        fontFamily: "'Inter', system-ui, sans-serif",
      }}
    >
      <span style={{ fontSize: 11, marginRight: 5 }}>{PLATFORM_ICON[msg.platform] ?? ""}</span>
      <span style={{ fontWeight: 800, color }}>{msg.username}</span>
      <span style={{ color: "#71717a", margin: "0 6px" }}>:</span>
      <span style={{ color: "#e4e4e7" }}>{msg.message}</span>
    </div>
  );
}
