"use client";
// src/app/overlay/wheel/WheelOverlayClient.tsx
// Realtime Wheel of Fortune via SSE (/api/overlay/stream/wheel) + polling fallback;
// when a NEW spin appears it spins to the winning segment, then flashes a banner.
import { useEffect, useRef, useState } from "react";
import { WheelGraphic, rotationForIndex, type WheelSeg } from "@/components/WheelGraphic";
import { useOverlayStream } from "@/lib/use-overlay-stream";

const SPIN_MS = 5000;       // must match the CSS transition in WheelGraphic
const BANNER_MS = 6000;     // how long the winner banner stays after the spin

type Latest = {
  id: string;
  segmentIndex: number;
  segmentLabel: string;
  rewardTokens: number;
  actorName: string;
  at: string;
};

type WheelFeed = { enabled: boolean; segments: WheelSeg[]; latest: Latest | null };

export function WheelOverlayClient() {
  const { data, status } = useOverlayStream<WheelFeed>({ feed: "wheel", intervalMs: 2000 });
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [winner, setWinner] = useState<Latest | null>(null);

  const lastSpinId = useRef<string | null>(null);
  const initialised = useRef(false);
  const rotationRef = useRef(0);
  const bannerTimers = useRef<number[]>([]);

  // Detect a NEW spin in each fresh payload → animate to its segment, then banner.
  useEffect(() => {
    const latest = data?.latest;
    if (!latest) return;

    // First payload: sync to the latest spin silently (don't replay an old result).
    if (!initialised.current) {
      initialised.current = true;
      lastSpinId.current = latest.id;
      return;
    }
    if (latest.id !== lastSpinId.current && latest.segmentIndex >= 0) {
      lastSpinId.current = latest.id;
      const next = rotationForIndex(rotationRef.current, latest.segmentIndex, (data?.segments ?? []).length);
      rotationRef.current = next;
      setSpinning(true);
      setRotation(next);
      setWinner(null);
      // Replace any prior pending banner timers so an intervening tick can't cancel them.
      bannerTimers.current.forEach(clearTimeout);
      bannerTimers.current = [
        window.setTimeout(() => setWinner(latest), SPIN_MS),
        window.setTimeout(() => setWinner(null), SPIN_MS + BANNER_MS),
      ];
    }
  }, [data]);

  // Clear pending banner timers on unmount.
  useEffect(() => () => bannerTimers.current.forEach(clearTimeout), []);

  const segments = data?.segments ?? [];

  if (status === "no-token") return <Box msg="Missing ?token=<OVERLAY_TOKEN>" />;
  if (status === "unauthorized") return <Box msg="Invalid token" />;
  if (segments.length < 2) return null;

  return (
    <div style={{ position: "fixed", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 18, pointerEvents: "none", fontFamily: "'Inter', system-ui, sans-serif" }}>
      <WheelGraphic segments={segments} rotation={rotation} size={360} spinning={spinning} />
      {winner && (
        <div
          style={{
            background: "rgba(10,10,14,0.9)",
            backdropFilter: "blur(8px)",
            borderRadius: 14,
            padding: "14px 26px",
            textAlign: "center",
            color: "#fff",
            boxShadow: "0 8px 30px rgba(0,0,0,.5)",
            border: `2px solid ${winner.rewardTokens > 0 ? "#10b981" : "#52525b"}`,
            animation: "wheelPop .4s ease-out",
          }}
        >
          <div style={{ fontSize: 20, fontWeight: 800 }}>{winner.actorName}</div>
          <div style={{ fontSize: 16, marginTop: 2, color: winner.rewardTokens > 0 ? "#34d399" : "#a1a1aa" }}>
            {winner.rewardTokens > 0 ? `wygrał ${winner.rewardTokens.toLocaleString("pl-PL")} GT — ${winner.segmentLabel} 🎉` : `${winner.segmentLabel} — następnym razem!`}
          </div>
        </div>
      )}
      <style>{`@keyframes wheelPop { from { transform: scale(.7); opacity: 0 } to { transform: scale(1); opacity: 1 } }`}</style>
    </div>
  );
}

function Box({ msg }: { msg: string }) {
  return (
    <div style={{ position: "fixed", top: 16, left: 16, padding: "12px 16px", borderRadius: 8, background: "rgba(220,38,38,0.85)", fontFamily: "system-ui, sans-serif", fontSize: 14, color: "#fff", zIndex: 999999 }}>
      {msg}
    </div>
  );
}
