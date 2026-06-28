// src/app/overlay/predictions/page.tsx
// OBS browser source URL: /overlay/predictions?token=<OVERLAY_TOKEN>
// Shows the current open/locked prediction (same overlay token as alerts/goals).
import { PredictionOverlayClient } from "./PredictionOverlayClient";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Predictions Overlay",
  robots: { index: false, follow: false },
};

export default function PredictionsOverlayPage() {
  return (
    <>
      <PredictionOverlayClient />
    </>
  );
}
