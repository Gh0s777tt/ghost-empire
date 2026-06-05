"use client";
// src/app/overlay/rumble/RumbleOverlayClient.tsx
// Polls /api/alerts/rumble and shows a compact Rumble status pill: LIVE + viewers
// when streaming, otherwise follower / subscriber counts.
import { useEffect, useState } from "react";

const POLL_MS = 15_000;
const RUMBLE_GREEN = "#85c742";

type Status = { configured: boolean; live: boolean; followers: number; subscribers: number; title: string | null; watching: number };

export function RumbleOverlayClient() {
  const [token, setToken] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "no-token" | "unauthorized" | "ok">("idle");
  const [data, setData] = useState<Status | null>(null);

  useEffect(() => {
    const t = new URL(window.location.href).searchParams.get("token");
    if (!t) { setStatus("no-token"); return; }
    setToken(t);
  }, []);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch(`/api/alerts/rumble?token=${encodeURIComponent(token)}`, { cache: "no-store" });
        if (cancelled) return;
        if (res.status === 401) { setStatus("unauthorized"); return; }
        if (!res.ok) return;
        setData(await res.json());
        setStatus("ok");
      } catch { /* retry */ }
    };
    void poll();
    const id = setInterval(poll, POLL_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, [token]);

  if (status === "no-token") return <Box msg="Missing ?token=" />;
  if (status === "unauthorized") return <Box msg="Invalid token" />;
  if (!data || !data.configured) return null;

  return (
    <div style={{ position: "fixed", top: 16, left: 16, fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div style={{
        display: "inline-flex", alignItems: "center", gap: 10, padding: "10px 16px", borderRadius: 12,
        background: "rgba(10,12,10,0.88)", backdropFilter: "blur(8px)", border: `2px solid ${RUMBLE_GREEN}`,
        boxShadow: "0 6px 24px rgba(0,0,0,.5)", color: "#fff",
      }}>
        <span style={{ fontWeight: 900, color: RUMBLE_GREEN, letterSpacing: 1 }}>RUMBLE</span>
        {data.live ? (
          <>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontWeight: 800, color: "#ff4444" }}>
              <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#ff4444", boxShadow: "0 0 8px #ff4444" }} /> LIVE
            </span>
            <span style={{ color: "#d4d4d8" }}>👁 {data.watching.toLocaleString("pl-PL")}</span>
          </>
        ) : (
          <span style={{ color: "#a1a1aa", fontWeight: 600 }}>
            {data.followers.toLocaleString("pl-PL")} obserwujących{data.subscribers > 0 ? ` · ${data.subscribers.toLocaleString("pl-PL")} sub` : ""}
          </span>
        )}
      </div>
      {data.live && data.title && (
        <div style={{ marginTop: 6, maxWidth: 360, fontSize: 13, color: "#e4e4e7", background: "rgba(10,12,10,0.8)", padding: "6px 12px", borderRadius: 8 }}>
          {data.title}
        </div>
      )}
    </div>
  );
}

function Box({ msg }: { msg: string }) {
  return <div style={{ position: "fixed", top: 16, left: 16, padding: "12px 16px", borderRadius: 8, background: "rgba(220,38,38,0.85)", color: "#fff", fontFamily: "system-ui", fontSize: 14 }}>{msg}</div>;
}
