// src/app/offline/layout.tsx
// Standalone <html>/<body> for the PWA offline fallback. Lives OUTSIDE the [locale]
// segment on purpose: when the service worker serves this page the network is down,
// so it must not depend on locale routing, providers or Google Fonts to render. All
// styling is inline (see page.tsx) so it looks right even with zero cached assets.
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Offline",
  robots: { index: false, follow: false },
};

export default function OfflineLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pl" className="dark">
      <body style={{ margin: 0, background: "#000", color: "#e4e4e7" }}>{children}</body>
    </html>
  );
}
