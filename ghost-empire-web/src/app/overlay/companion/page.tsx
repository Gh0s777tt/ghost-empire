// src/app/overlay/companion/page.tsx
// OBS browser source: /overlay/companion?token=<OVERLAY_TOKEN> (+ optional &accent=RRGGBB)
// Shows the community's "Champion Companion" — the most-fed pet — on stream.
import { CompanionOverlayClient } from "./CompanionOverlayClient";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Companion Overlay",
  robots: { index: false, follow: false },
};

export default function CompanionOverlayPage() {
  return (
    <>
      <style>{`
        html, body { background: transparent !important; }
        body footer { display: none !important; }
        body { min-height: 0 !important; }
      `}</style>
      <CompanionOverlayClient />
    </>
  );
}
