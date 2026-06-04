"use client";
// src/app/overlay/last-event/LastEventOverlayClient.tsx
// Polls /api/alerts/recent-events every 5s and shows the "last sub" or "last donator"
// card (selected by ?kind=). Hidden until the first matching event exists.
import { useEffect, useState } from "react";
import { LastEventCard } from "@/components/LastEventCard";

const POLL_INTERVAL_MS = 5000;

type EventData = { name: string; amount: number | null; amountLabel: string | null; at: string } | null;
type Feed = { sub: EventData; donation: EventData; follow: EventData };
type Kind = "sub" | "donation" | "follow";

const KIND_META: Record<Kind, { label: string; icon: string; accent: string; showAmount: boolean }> = {
  sub: { label: "Ostatni sub", icon: "💜", accent: "#a855f7", showAmount: false },
  donation: { label: "Ostatni donator", icon: "💰", accent: "#22c55e", showAmount: true },
  follow: { label: "Ostatni follower", icon: "⭐", accent: "#3b82f6", showAmount: false },
};

export function LastEventOverlayClient() {
  const [token, setToken] = useState<string | null>(null);
  const [kind, setKind] = useState<Kind>("sub");
  const [accentOverride, setAccentOverride] = useState<string | null>(null);
  const [authStatus, setAuthStatus] = useState<"idle" | "ok" | "unauthorized" | "no-token">("idle");
  const [feed, setFeed] = useState<Feed | null>(null);

  useEffect(() => {
    const params = new URL(window.location.href).searchParams;
    const t = params.get("token");
    if (!t) { setAuthStatus("no-token"); return; }
    setToken(t);
    const k = params.get("kind");
    if (k === "donation" || k === "sub" || k === "follow") setKind(k);
    const a = params.get("accent");
    if (a && /^[0-9a-fA-F]{6}$/.test(a)) setAccentOverride(`#${a}`);
  }, []);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch(`/api/alerts/recent-events?token=${encodeURIComponent(token)}`, { cache: "no-store" });
        if (cancelled) return;
        if (res.status === 401) { setAuthStatus("unauthorized"); return; }
        if (!res.ok) return;
        setFeed(await res.json());
        setAuthStatus("ok");
      } catch {
        /* retry next tick */
      }
    };
    void poll();
    const id = setInterval(poll, POLL_INTERVAL_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, [token]);

  if (authStatus === "no-token") return <StatusBox msg="Missing ?token=<OVERLAY_TOKEN>" />;
  if (authStatus === "unauthorized") return <StatusBox msg="Invalid token" />;
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
