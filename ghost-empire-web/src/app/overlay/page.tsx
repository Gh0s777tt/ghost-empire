// src/app/overlay/page.tsx
// OBS browser source URL: /overlay?token=<OVERLAY_TOKEN>
//
// Renders a transparent canvas that polls /api/alerts/queue and animates
// incoming alerts. The inline <style> overrides root layout (bg-black + footer)
// so OBS gets a transparent capture.
import { OverlayClient } from "./OverlayClient";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Stream Overlay",
  robots: { index: false, follow: false },
};

export default function OverlayPage() {
  return (
    <>
      <style>{`
        html, body { background: transparent !important; }
        body footer { display: none !important; }
        body { min-height: 0 !important; }
      `}</style>
      <OverlayClient />
    </>
  );
}
