"use client";
// src/app/overlay/last-event/LastEventOverlayClient.tsx
// Realtime "last sub/donator/follower" via SSE (/api/overlay/stream/recent-events)
// + polling fallback; card selected by ?kind=. Hidden until the first matching event.
import { useEffect, useState } from "react";
import { LastEventCard } from "@/components/LastEventCard";
import { useOverlayStream } from "@/lib/use-overlay-stream";

type EventData = { name: string; amount: number | null; amountLabel: string | null; at: string } | null;
type Feed = { sub: EventData; donation: EventData; follow: EventData };
type Kind = "sub" | "donation" | "follow";

const KIND_META: Record<Kind, { label: string; icon: string; accent: string; showAmount: boolean }> = {
  sub: { label: "Ostatni sub", icon: "💜", accent: "#a855f7", showAmount: false },
  donation: { label: "Ostatni donator", icon: "💰", accent: "#22c55e", showAmount: true },
  follow: { label: "Ostatni follower", icon: "⭐", accent: "#3b82f6", showAmount: false },
};

export function LastEventOverlayClient() {
  const { data: feed, status } = useOverlayStream<Feed>({ feed: "recent-events", intervalMs: 5000 });
  const [kind, setKind] = useState<Kind>("sub");
  const [accentOverride, setAccentOverride] = useState<string | null>(null);

  // kind + accent are client-only display config from the URL (not sent to the server).
  useEffect(() => {
    const params = new URL(window.location.href).searchParams;
    const k = params.get("kind");
    if (k === "donation" || k === "sub" || k === "follow") setKind(k);
    const a = params.get("accent");
    if (a && /^[0-9a-fA-F]{6}$/.test(a)) setAccentOverride(`#${a}`);
  }, []);

  if (status === "no-token") return <StatusBox msg="Missing ?token=<OVERLAY_TOKEN>" />;
  if (status === "unauthorized") return <StatusBox msg="Invalid token" />;
  if (!feed) return null;

  const meta = KIND_META[kind];
  const data = kind === "donation" ? feed.donation : kind === "follow" ? feed.follow : feed.sub;
  if (!data) return null;

  const detail = meta.showAmount && data.amount != null
    ? `${data.amount.toLocaleString("pl-PL")}${data.amountLabel ? ` ${data.amountLabel}` : ""}`
    : null;

  return (
    <div style={{ position: "fixed", top: 16, left: 16, zIndex: 999999, pointerEvents: "none" }}>
      <LastEventCard
        label={meta.label}
        name={data.name}
        detail={detail}
        icon={meta.icon}
        accent={accentOverride ?? meta.accent}
      />
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
