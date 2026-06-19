// src/app/overlay/support-goal/page.tsx
// OBS browser source: /overlay/support-goal?token=<OVERLAY_TOKEN>
// A live fundraising-goal progress bar (#528) for the streamer's support goal
// (#519) — drop one source into the scene; it fills as the streamer bumps the
// collected amount in /admin#payments.
import { SupportGoalOverlayClient } from "./SupportGoalOverlayClient";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Support Goal Overlay",
  robots: { index: false, follow: false },
};

export default function SupportGoalOverlayPage() {
  return (
    <>
      <style>{`
        html, body { background: transparent !important; }
        body footer { display: none !important; }
        body { min-height: 0 !important; }
      `}</style>
      <SupportGoalOverlayClient />
    </>
  );
}
