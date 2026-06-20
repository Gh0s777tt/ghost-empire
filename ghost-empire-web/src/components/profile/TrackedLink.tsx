"use client";
// src/components/profile/TrackedLink.tsx
// A normal external <a> that fires a best-effort click beacon first (#542), so a
// server-rendered list (e.g. public-profile social links) can record opens without
// becoming a client component itself. sendBeacon survives the tab navigating away.
import type { ReactNode } from "react";

export function TrackedLink({ href, beaconId, className, title, children }: {
  href: string; beaconId: string; className?: string; title?: string; children: ReactNode;
}) {
  function track() {
    try {
      const blob = new Blob([JSON.stringify({ id: beaconId })], { type: "application/json" });
      if (navigator.sendBeacon) navigator.sendBeacon("/api/profile/social-click", blob);
      else void fetch("/api/profile/social-click", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: beaconId }), keepalive: true });
    } catch { /* ignore */ }
  }
  return (
    <a href={href} onClick={track} target="_blank" rel="noreferrer" className={className} title={title}>
      {children}
    </a>
  );
}
