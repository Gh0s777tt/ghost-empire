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
      <EmojiComboOverlayClient />
    </>
  );
}
