// src/app/overlay/codes/page.tsx
// OBS browser source URL: /overlay/codes?token=<OVERLAY_TOKEN>
// Shows one giveaway code at a time, rotating every CodeDropConfig.intervalSeconds
// (same overlay token as alerts/goals/subathon).
import { CodesOverlayClient } from "./CodesOverlayClient";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Codes Overlay",
  robots: { index: false, follow: false },
};

export default function CodesOverlayPage() {
  return (
    <>
      <style>{`
        html, body { background: transparent !important; }
        body footer { display: none !important; }
        body { min-height: 0 !important; }
      `}</style>
      <CodesOverlayClient />
    </>
  );
}
