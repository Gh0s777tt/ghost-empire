// src/app/overlay/trivia/page.tsx
// OBS browser source: /overlay/trivia?token=<OVERLAY_TOKEN>
// Shows the live trivia question (#524) with answer distribution + a countdown;
// reveals the correct answer when the timer ends. Hidden when no round is live.
import { TriviaOverlayClient } from "./TriviaOverlayClient";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Trivia Overlay",
  robots: { index: false, follow: false },
};

export default function TriviaOverlayPage() {
  return (
    <>
      <style>{`
        html, body { background: transparent !important; }
        body footer { display: none !important; }
        body { min-height: 0 !important; }
      `}</style>
      <TriviaOverlayClient />
    </>
  );
}
