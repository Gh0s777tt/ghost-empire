// src/app/manifest.ts
// Web App Manifest — makes the portal installable (Add to Home Screen) and sets
// the standalone display + brand colors used by the OS UI. Next serves this at
// /manifest.webmanifest and auto-injects <link rel="manifest">.
import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE.name,
    short_name: SITE.shortName,
    description:
      `Oficjalny portal społeczności ${SITE.name} — Ghost Tokens, eventy, sklep, ranking.`,
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: SITE.backgroundColor,
    theme_color: SITE.brandColor,
    lang: "pl",
    categories: ["entertainment", "social", "games"],
    icons: [
      // Skull brand mark. `any` for the launcher/tab; `maskable` is padded so
      // Android's circle/squircle mask never clips the skull.
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
