"use client";
// src/components/PresenceBeacon.tsx
// Portal presence heartbeat (#767) — renders nothing; while the tab is visible it POSTs
// /api/presence every ~25 s so this visitor counts as "online now". Guests get a random
// anon id persisted in localStorage (pure hex — the server validates the shape). All
// failures are silent: presence is decorative and must never affect the page.
import { useEffect } from "react";
import { PRESENCE_HEARTBEAT_MS } from "@/lib/presence-shared";

function anonId(): string {
  try {
    const KEY = "ge_presence_id";
    let id = localStorage.getItem(KEY);
    if (!id || !/^[a-f0-9]{8,32}$/.test(id)) {
      id = crypto.randomUUID().replace(/-/g, "").slice(0, 32);
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    return "";
  }
}

export function PresenceBeacon() {
  useEffect(() => {
    let stopped = false;
    const beat = () => {
      if (stopped || document.visibilityState !== "visible") return;
      void fetch("/api/presence", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ anonId: anonId() }),
        keepalive: true,
      }).catch(() => {});
    };
    beat();
    const iv = setInterval(beat, PRESENCE_HEARTBEAT_MS);
    document.addEventListener("visibilitychange", beat);
    return () => {
      stopped = true;
      clearInterval(iv);
      document.removeEventListener("visibilitychange", beat);
    };
  }, []);
  return null;
}
