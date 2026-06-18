// src/app/overlay/clan/page.tsx
// OBS browser source: /overlay/clan?token=<OVERLAY_TOKEN> (+ optional &accent=RRGGBB)
// Shows the community's "Champion Clan" — the richest clan by treasury — on stream.
import { ClanOverlayClient } from "./ClanOverlayClient";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Clan Overlay",
  robots: { index: false, follow: false },
};

export default function ClanOverlayPage() {
  return (
    <>
      <style>{`
        html, body { background: transparent !important; }
        body footer { display: none !important; }
        body { min-height: 0 !important; }
      `}</style>
      <ClanOverlayClient />
    </>
  );
}
