"use client";
// src/components/ClientErrorReporter.tsx
// Reports uncaught client errors (window "error" + "unhandledrejection") to
// /api/telemetry/client-error so they show up in Vercel logs instead of vanishing
// in users' consoles. Deduped per message, max 5 per page load, sendBeacon-first
// (survives navigation), renders nothing.
import { useEffect } from "react";

const MAX_PER_LOAD = 5;

export function ClientErrorReporter() {
  useEffect(() => {
    let sent = 0;
    const seen = new Set<string>();

    const report = (message: string, stack?: string) => {
      if (!message || sent >= MAX_PER_LOAD || seen.has(message)) return;
      seen.add(message);
      sent++;
      const payload = JSON.stringify({
        message: message.slice(0, 500),
        stack: stack?.slice(0, 2000),
        url: location.href,
        ua: navigator.userAgent,
      });
      try {
        const ok = navigator.sendBeacon?.("/api/telemetry/client-error", new Blob([payload], { type: "application/json" }));
        if (!ok) {
          void fetch("/api/telemetry/client-error", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: payload,
            keepalive: true,
          }).catch(() => {});
        }
      } catch { /* never break the page over telemetry */ }
    };

    const onError = (e: ErrorEvent) => report(e.message || "window.onerror", e.error?.stack);
    const onRejection = (e: PromiseRejectionEvent) => {
      const r: unknown = e.reason;
      if (typeof r === "string") report(r);
      else if (r instanceof Error) report(r.message, r.stack);
      else report("unhandledrejection");
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}
