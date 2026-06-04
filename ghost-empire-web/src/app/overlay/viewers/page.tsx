// src/app/overlay/viewers/page.tsx
// OBS browser source: /overlay/viewers?token=<OVERLAY_TOKEN> (+ optional &accent=RRGGBB)
import { ViewersOverlayClient } from "./ViewersOverlayClient";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Viewers Overlay",
  robots: { index: false, follow: false },
};

export default function ViewersOverlayPage() {
  return (
    <>
      <style>{`
        html, body { background: transparent !important; }
        body footer { display: none !important; }
        body { min-height: 0 !important; }
      `}</style>
      <ViewersOverlayClient />
    </>
  );
}
