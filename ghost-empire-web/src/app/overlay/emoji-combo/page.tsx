// src/app/overlay/emoji-combo/page.tsx
// OBS browser source: /overlay/emoji-combo?token=<OVERLAY_TOKEN>
import { EmojiComboOverlayClient } from "./EmojiComboOverlayClient";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Emoji Combo Overlay",
  robots: { index: false, follow: false },
};

export default function EmojiComboOverlayPage() {
  return (
    <>
      <style>{`
        html, body { background: transparent !important; }
        body footer { display: none !important; }
        body { min-height: 0 !important; }
        @keyframes ge-combo-pop {
          0% { transform: scale(0.3); opacity: 0; }
          60% { transform: scale(1.15); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes ge-combo-pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.08); }
        }
      `}</style>
      <EmojiComboOverlayClient />
    </>
  );
}
