"use client";
// src/app/overlay/widget/CustomWidgetOverlayClient.tsx
// Renders one custom widget (by ?id=) at its configured position. Polls /api/alerts/widget
// every 8s so edits in the admin generator show up live without re-adding the OBS source.
import { useEffect, useState, type CSSProperties } from "react";
import { CustomWidgetCard } from "@/components/CustomWidgetCard";

const POLL_INTERVAL_MS = 8000;
const PAD = 24;

type Feed =
  | { exists: false }
  | {
      exists: true;
      text: string;
      accentColor: string;
      textColor: string;
      fontSizePx: number;
      fontFamily: string;
      position: string;
      showCard: boolean;
      bgGradient: boolean;
      bgColor1: string;
      bgColor2: string;
      bgAngle: number;
    };

function positionStyle(position: string): CSSProperties {
  const s: CSSProperties = { position: "fixed", zIndex: 999999, pointerEvents: "none" };
  if (position === "center") {
    s.top = "50%"; s.left = "50%"; s.transform = "translate(-50%, -50%)";
    return s;
  }
  const [v, h] = position.split("-");
  if (v === "top") s.top = PAD; else s.bottom = PAD;
  if (h === "left") s.left = PAD;
  else if (h === "right") s.right = PAD;
  else { s.left = "50%"; s.transform = "translateX(-50%)"; }
  return s;
}

export function CustomWidgetOverlayClient() {
  const [token, setToken] = useState<string | null>(null);
  const [id, setId] = useState<string | null>(null);
  const [authStatus, setAuthStatus] = useState<"idle" | "ok" | "unauthorized" | "no-token" | "no-id">("idle");
  const [feed, setFeed] = useState<Feed | null>(null);

  useEffect(() => {
    const params = new URL(window.location.href).searchParams;
    const t = params.get("token");
    const i = params.get("id");
    if (!t) { setAuthStatus("no-token"); return; }
    if (!i) { setAuthStatus("no-id"); return; }
    setToken(t);
    setId(i);
  }, []);

  useEffect(() => {
    if (!token || !id) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch(`/api/alerts/widget?token=${encodeURIComponent(token)}&id=${encodeURIComponent(id)}`, { cache: "no-store" });
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
    const idt = setInterval(poll, POLL_INTERVAL_MS);
    return () => { cancelled = true; clearInterval(idt); };
  }, [token, id]);

  if (authStatus === "no-token") return <StatusBox msg="Missing ?token=<OVERLAY_TOKEN>" />;
  if (authStatus === "no-id") return <StatusBox msg="Missing ?id=<WIDGET_ID>" />;
  if (authStatus === "unauthorized") return <StatusBox msg="Invalid token" />;
  if (!feed || !feed.exists) return null;

  return (
    <div style={positionStyle(feed.position)}>
      <CustomWidgetCard
        text={feed.text}
        accentColor={feed.accentColor}
        textColor={feed.textColor}
        fontSizePx={feed.fontSizePx}
        fontFamily={feed.fontFamily}
        showCard={feed.showCard}
        bgGradient={feed.bgGradient}
        bgColor1={feed.bgColor1}
        bgColor2={feed.bgColor2}
        bgAngle={feed.bgAngle}
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
