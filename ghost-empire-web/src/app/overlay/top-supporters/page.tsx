// src/app/overlay/top-supporters/page.tsx
// OBS browser source: /overlay/top-supporters?token=<OVERLAY_TOKEN>
// An on-stream "top supporters" credits board (#531) — the all-time biggest
// tippers (#530), drop one source into the scene as a thank-you leaderboard.
import { TopSupportersOverlayClient } from "./TopSupportersOverlayClient";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Top Supporters Overlay",
  robots: { index: false, follow: false },
};

export default function TopSupportersOverlayPage() {
  return (
    <>
      <style>{`
        html, body { background: transparent !important; }
        body footer { display: none !important; }
        body { min-height: 0 !important; }
      `}</style>
      <TopSupportersOverlayClient />
    </>
  );
}
