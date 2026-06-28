// src/app/overlay/support-qr/page.tsx
// OBS browser source: /overlay/support-qr?token=<OVERLAY_TOKEN>
// A single QR rotating through the streamer's support/tip methods (#514) — drop one
// source into the scene and it cycles every ~10s.
import { SupportQrOverlayClient } from "./SupportQrOverlayClient";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Support QR Overlay",
  robots: { index: false, follow: false },
};

export default function SupportQrOverlayPage() {
  return (
    <>
      <SupportQrOverlayClient />
    </>
  );
}
