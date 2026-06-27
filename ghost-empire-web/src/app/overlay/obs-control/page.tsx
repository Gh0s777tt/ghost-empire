// src/app/overlay/obs-control/page.tsx
// OBS browser source URL: /overlay/obs-control?token=<OVERLAY_TOKEN>
// PHASE 3C Slice 3 — headless actuator: add this as a browser source INSIDE OBS (on the
// same machine as OBS) and it drives scenes/sources/filters from your event->action rules
// (/admin#obsrules) using your OBS WebSocket creds (/admin#integrations). Noindex/no-store.
import { ObsControlClient } from "./ObsControlClient";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "OBS Control",
  robots: { index: false, follow: false },
};

export default function ObsControlPage() {
  return (
    <>
      <style>{`
        html, body { background: transparent !important; }
        body footer { display: none !important; }
        body { min-height: 0 !important; }
      `}</style>
      <ObsControlClient />
    </>
  );
}
