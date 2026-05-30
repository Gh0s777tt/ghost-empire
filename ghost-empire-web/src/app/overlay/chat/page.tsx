// src/app/overlay/chat/page.tsx
// OBS browser source URL: /overlay/chat?token=<OVERLAY_TOKEN>
// Shows combined Twitch + Kick + YouTube chat (uses the same overlay token as goals/alerts).
import { ChatOverlayClient } from "./ChatOverlayClient";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Chat Overlay",
  robots: { index: false, follow: false },
};

export default function ChatOverlayPage() {
  return (
    <>
      <style>{`
        html, body { background: transparent !important; }
        body footer { display: none !important; }
        body { min-height: 0 !important; }
      `}</style>
      <ChatOverlayClient />
    </>
  );
}
