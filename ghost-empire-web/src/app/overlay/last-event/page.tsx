// src/app/overlay/last-event/page.tsx
// OBS browser source: /overlay/last-event?token=<OVERLAY_TOKEN>&kind=sub|donation
// Optional &accent=RRGGBB (no #) to override the card color.
import { LastEventOverlayClient } from "./LastEventOverlayClient";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Last Event Overlay",
  robots: { index: false, follow: false },
};

export default function LastEventOverlayPage() {
  return (
    <>
      <LastEventOverlayClient />
    </>
  );
}
