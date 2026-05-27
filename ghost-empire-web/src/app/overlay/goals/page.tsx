// src/app/overlay/goals/page.tsx
// OBS browser source URL: /overlay/goals?token=<OVERLAY_TOKEN>
// Renders animated progress bars for active stream goals + hype train indicator.
import { GoalsOverlayClient } from "./GoalsOverlayClient";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Goals Overlay",
  robots: { index: false, follow: false },
};

export default function GoalsOverlayPage() {
  return (
    <>
      <style>{`
        html, body { background: transparent !important; }
        body footer { display: none !important; }
        body { min-height: 0 !important; }
      `}</style>
      <GoalsOverlayClient />
    </>
  );
}
