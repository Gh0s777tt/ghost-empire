// src/app/overlay/clan-war/page.tsx
// OBS browser source: /overlay/clan-war?token=<OVERLAY_TOKEN> (+ optional &accent=RRGGBB)
// Shows the LIVE clan war — top clans by war points + countdown + prize — on stream.
// Renders nothing when no war is live, so it can sit in a scene permanently.
import { ClanWarOverlayClient } from "./ClanWarOverlayClient";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Clan War Overlay",
  robots: { index: false, follow: false },
};

export default function ClanWarOverlayPage() {
  return (
    <>
      <style>{`
        html, body { background: transparent !important; }
        body footer { display: none !important; }
        body { min-height: 0 !important; }
      `}</style>
      <ClanWarOverlayClient />
    </>
  );
}
