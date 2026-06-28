// src/app/overlay/subathon/page.tsx
// OBS browser source URL: /overlay/subathon?token=<OVERLAY_TOKEN>
// Countdown that subs/gifts/donations extend live (same overlay token as goals/alerts).
import { SubathonOverlayClient } from "./SubathonOverlayClient";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Subathon Overlay",
  robots: { index: false, follow: false },
};

export default function SubathonOverlayPage() {
  return (
    <>
      <SubathonOverlayClient />
    </>
  );
}
