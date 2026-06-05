// src/app/overlay/wheel/page.tsx
// OBS browser source URL: /overlay/wheel?token=<OVERLAY_TOKEN>
// Animates the Wheel of Fortune landing on each new spin, then shows the winner.
import { WheelOverlayClient } from "./WheelOverlayClient";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Wheel Overlay",
  robots: { index: false, follow: false },
};

export default function WheelOverlayPage() {
  return (
    <>
      <style>{`
        html, body { background: transparent !important; }
        body footer { display: none !important; }
        body { min-height: 0 !important; }
      `}</style>
      <WheelOverlayClient />
    </>
  );
}
