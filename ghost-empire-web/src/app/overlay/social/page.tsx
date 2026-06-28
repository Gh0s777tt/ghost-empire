// src/app/overlay/social/page.tsx
// OBS browser source: /overlay/social?token=<OVERLAY_TOKEN>
// Shows the streamer's latest X or Instagram post (X first), to cross-promote socials
// on stream. Dormant until an X/IG token is set in /admin#integrations (#752/#753).
import { SocialOverlayClient } from "./SocialOverlayClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Social Overlay", robots: { index: false, follow: false } };

export default function SocialOverlayPage() {
  return <SocialOverlayClient />;
}
