// src/app/overlay/sponsors/page.tsx
// OBS browser source: /overlay/sponsors?token=<OVERLAY_TOKEN>
// Rotates the streamer's sponsors/partners (#538) one at a time — drop one source
// into the scene for contractual on-stream logo display.
import { SponsorsOverlayClient } from "./SponsorsOverlayClient";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Sponsors Overlay",
  robots: { index: false, follow: false },
};

export default function SponsorsOverlayPage() {
  return (
    <>
      <SponsorsOverlayClient />
    </>
  );
}
