// src/app/overlay/presence/page.tsx
// OBS browser source: /overlay/presence?token=<OVERLAY_TOKEN> (+ optional &accent=RRGGBB)
// Shows how many people are on the PORTAL right now (#767) — distinct from
// /overlay/viewers, which shows the Twitch stream viewer count.
import { PresenceOverlayClient } from "./PresenceOverlayClient";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Presence Overlay",
  robots: { index: false, follow: false },
};

export default function PresenceOverlayPage() {
  return <PresenceOverlayClient />;
}
