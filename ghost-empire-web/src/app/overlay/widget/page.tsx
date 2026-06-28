// src/app/overlay/widget/page.tsx
// OBS browser source: /overlay/widget?token=<OVERLAY_TOKEN>&id=<WIDGET_ID>
import { CustomWidgetOverlayClient } from "./CustomWidgetOverlayClient";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Custom Widget Overlay",
  robots: { index: false, follow: false },
};

export default function CustomWidgetOverlayPage() {
  return (
    <>
      <CustomWidgetOverlayClient />
    </>
  );
}
