// src/app/overlay/rumble/page.tsx
// OBS browser source: /overlay/rumble?token=<OVERLAY_TOKEN>
import { RumbleOverlayClient } from "./RumbleOverlayClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Rumble Overlay", robots: { index: false, follow: false } };

export default function RumbleOverlayPage() {
  return (
    <>
      <style>{`html,body{background:transparent !important;} body footer{display:none !important;} body{min-height:0 !important;}`}</style>
      <RumbleOverlayClient />
    </>
  );
}
