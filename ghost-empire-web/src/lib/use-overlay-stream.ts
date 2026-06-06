"use client";
// src/lib/use-overlay-stream.ts
// Shared OBS-overlay data hook: realtime via SSE (/api/overlay/stream/<feed>),
// with automatic, transparent fallback to polling (/api/alerts/<feed>). Reads
// ?token= from the URL. Returns the latest parsed payload + an auth status.
//
// Every overlay is live on stream, so this is defensive everywhere: any SSE
// problem (unreachable endpoint, old deploy, bad token, dropped socket) quietly
// drops to the proven polling transport so the overlay never goes dark.
import { useEffect, useMemo, useState } from "react";

export type OverlayStatus = "idle" | "ok" | "unauthorized" | "no-token";

export function useOverlayStream<T>(opts: {
  /** Feed key — must exist in lib/overlay-feeds (e.g. "goals", "viewers"). */
  feed: string;
  /** Extra SERVER query params sent on both transports (e.g. { id } for widgets). */
  query?: Record<string, string | null | undefined>;
  /** Polling-fallback interval (ms). Defaults to 3000. */
  intervalMs?: number;
}): { data: T | null; status: OverlayStatus } {
  const { feed, query, intervalMs = 3000 } = opts;
  const [data, setData] = useState<T | null>(null);
  const [status, setStatus] = useState<OverlayStatus>("idle");
  const [token, setToken] = useState<string | null>(null);

  // Stable string form of the extra query params (skips null/undefined values).
  const queryStr = useMemo(() => {
    if (!query) return "";
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) if (v != null && v !== "") sp.set(k, v);
    return sp.toString();
  }, [query]);

  // Read the overlay token from the URL once on mount.
  useEffect(() => {
    const t = new URL(window.location.href).searchParams.get("token");
    if (!t) {
      setStatus("no-token");
      return;
    }
    setToken(t);
  }, []);

  useEffect(() => {
    if (!token) return;

    let mode: "connecting" | "sse" | "polling" = "connecting";
    let es: EventSource | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let fallbackTimer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    const withParams = (path: string) => {
      const sp = new URLSearchParams(queryStr);
      sp.set("token", token);
      return `${path}?${sp.toString()}`;
    };

    // --- Polling fallback (the original, proven transport) ---
    const startPolling = () => {
      if (cancelled || mode === "polling") return;
      mode = "polling";
      if (es) {
        es.close();
        es = null;
      }
      const poll = async () => {
        try {
          const res = await fetch(withParams(`/api/alerts/${feed}`), { cache: "no-store" });
          if (cancelled) return;
          if (res.status === 401) {
            setStatus("unauthorized");
            return;
          }
          if (!res.ok) return;
          setData((await res.json()) as T);
          setStatus("ok");
        } catch {
          /* network blip — retry next tick */
        }
      };
      poll();
      pollTimer = setInterval(poll, intervalMs);
    };

    // --- SSE (preferred transport) ---
    const startSse = () => {
      if (typeof window === "undefined" || typeof EventSource === "undefined") {
        startPolling();
        return;
      }
      try {
        es = new EventSource(withParams(`/api/overlay/stream/${feed}`));
      } catch {
        startPolling();
        return;
      }

      // Watchdog: if SSE hasn't connected within 6s, drop to polling.
      fallbackTimer = setTimeout(() => {
        if (!cancelled && mode === "connecting") startPolling();
      }, 6000);

      es.onopen = () => {
        if (cancelled) return;
        mode = "sse";
        setStatus("ok");
        if (fallbackTimer) {
          clearTimeout(fallbackTimer);
          fallbackTimer = null;
        }
      };
      es.addEventListener("data", (ev) => {
        try {
          setData(JSON.parse((ev as MessageEvent).data) as T);
          setStatus("ok");
        } catch {
          /* ignore malformed frame */
        }
      });
      es.onerror = () => {
        if (cancelled || mode === "polling") return;
        // CONNECTING → EventSource is auto-reconnecting (e.g. after our server-side
        // self-close) — leave it. CLOSED → it gave up permanently (unreachable /
        // old deploy / 401 / token rotated on air) → fall back to polling.
        if (es && es.readyState === EventSource.CLOSED) startPolling();
      };
    };

    startSse();

    return () => {
      cancelled = true;
      if (es) es.close();
      if (pollTimer) clearInterval(pollTimer);
      if (fallbackTimer) clearTimeout(fallbackTimer);
    };
  }, [token, feed, queryStr, intervalMs]);

  return { data, status };
}
