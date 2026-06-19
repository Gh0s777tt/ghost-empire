"use client";
// src/app/overlay/clan-war/ClanWarOverlayClient.tsx
// Realtime live-clan-war board via SSE (/api/overlay/stream/clan-war) + polling
// fallback. Shows the war name, a 1s-ticking countdown, the prize pool, and the
// top clans by war points. Hidden entirely while no war is live.
import { useEffect, useState } from "react";
import { useOverlayStream } from "@/lib/use-overlay-stream";

type Standing = { tag: string; name: string; points: number };
type Feed =
  | { active: false }
  | { active: true; name: string; endsAt: string; prizePool: number; standings: Standing[] };

/** Compact remaining-time label ("2d 3h", "5h 12m", "8m") from an ISO endsAt. */
function remainingLabel(endsAt: string, now: number): string {
  const ms = new Date(endsAt).getTime() - now;
  if (ms <= 0) return "0m";
  const totalMin = Math.floor(ms / 60_000);
  const d = Math.floor(totalMin / 1440);
  const h = Math.floor((totalMin % 1440) / 60);
  const m = totalMin % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function ClanWarOverlayClient() {
  const { data: feed, status } = useOverlayStream<Feed>({ feed: "clan-war", intervalMs: 5000 });
  const [accent, setAccent] = useState("#E50914");
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const a = new URL(window.location.href).searchParams.get("accent");
    if (a && /^[0-9a-fA-F]{6}$/.test(a)) setAccent(`#${a}`);
  }, []);
  // Tick once a second so the countdown reads smoothly between feed updates.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (status === "no-token") return <StatusBox msg="Missing ?token=<OVERLAY_TOKEN>" />;
  if (status === "unauthorized") return <StatusBox msg="Invalid token" />;
  if (!feed || !feed.active) return null;

  const medals = ["🥇", "🥈", "🥉"];

  return (
    <div style={{ position: "fixed", top: 16, left: 16, zIndex: 999999, pointerEvents: "none" }}>
      <div
        style={{
          minWidth: 320,
          background: "rgba(15, 15, 20, 0.92)",
          backdropFilter: "blur(10px)",
          borderRadius: 16,
          padding: "12px 16px",
          border: `2px solid ${accent}`,
          boxShadow: `0 8px 24px rgba(0,0,0,0.5), 0 0 16px ${accent}55`,
          color: "#fff",
          fontFamily: "'Inter', system-ui, sans-serif",
        }}
      >
        {/* Header: title + countdown */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 4 }}>
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1.5, color: accent, textTransform: "uppercase", display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 16 }}>⚔️</span> {feed.name}
          </span>
          <span style={{ fontSize: 12, fontWeight: 700, opacity: 0.9, fontVariantNumeric: "tabular-nums" }}>
            ⏳ {remainingLabel(feed.endsAt, now)}
          </span>
        </div>

        {/* Prize pool */}
        <div style={{ fontSize: 11, opacity: 0.75, marginBottom: 8, fontVariantNumeric: "tabular-nums" }}>
          🏆 {feed.prizePool.toLocaleString("pl-PL")} GT
        </div>

        {/* Standings */}
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {feed.standings.map((c, i) => (
            <div
              key={c.tag}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "4px 8px",
                borderRadius: 8,
                background: i === 0 ? `${accent}22` : "rgba(255,255,255,0.04)",
                border: i === 0 ? `1px solid ${accent}88` : "1px solid transparent",
              }}
            >
              <span style={{ width: 20, textAlign: "center", fontSize: 13 }}>{medals[i] ?? i + 1}</span>
              <span style={{ fontSize: 11, fontWeight: 800, color: accent, fontFamily: "monospace" }}>[{c.tag}]</span>
              <span style={{ fontSize: 13, fontWeight: 600, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
              <span style={{ fontSize: 12, fontWeight: 700, fontVariantNumeric: "tabular-nums", opacity: 0.9 }}>{c.points.toLocaleString("pl-PL")}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StatusBox({ msg }: { msg: string }) {
  return (
    <div
      style={{
        position: "fixed",
        top: 16,
        left: 16,
        padding: "12px 16px",
        borderRadius: 8,
        background: "rgba(220, 38, 38, 0.85)",
        fontFamily: "system-ui, sans-serif",
        fontSize: 14,
        zIndex: 999999,
        color: "#fff",
      }}
    >
      {msg}
    </div>
  );
}
