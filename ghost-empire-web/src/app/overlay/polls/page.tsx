// src/app/overlay/polls/page.tsx
// OBS browser source URL: /overlay/polls?token=<OVERLAY_TOKEN>
// Shows the current open poll (same overlay token as alerts/goals).
import { PollOverlayClient } from "./PollOverlayClient";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Poll Overlay",
  robots: { index: false, follow: false },
};

export default function PollsOverlayPage() {
  return (
    <>
      <PollOverlayClient />
    </>
  );
}
