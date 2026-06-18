"use client";
// src/components/pwa/RegisterServiceWorker.tsx
// Registers the PWA service worker (/sw.js) once, after the page has loaded, in
// production only. Dev is skipped on purpose — a service worker fighting Turbopack
// HMR is a recipe for confusing stale-asset bugs. Registration failures are
// swallowed: the SW is a progressive enhancement, never required for the app to work.
import { useEffect } from "react";

export function RegisterServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* non-fatal — site works fine without the SW */
      });
    };

    if (document.readyState === "complete") register();
    else {
      window.addEventListener("load", register);
      return () => window.removeEventListener("load", register);
    }
  }, []);

  return null;
}
