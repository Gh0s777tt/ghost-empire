// src/app/manifest.ts
// Web App Manifest — makes the portal installable (Add to Home Screen) and sets
// the standalone display + brand colors used by the OS UI. Next serves this at
// /manifest.webmanifest and auto-injects <link rel="manifest">.
import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "GH0ST EMPIRE",
    short_name: "Ghost Empire",
    description:
      "Oficjalny portal społeczności GH0ST EMPIRE — Ghost Tokens, eventy, sklep, ranking.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0A0A0A",
    theme_color: "#E50914",
    lang: "pl",
    categories: ["entertainment", "social", "games"],
    icons: [
      // Vector icon scales to every required size; modern browsers/Android accept
      // SVG manifest icons. `maskable` lets Android render it inside its mask.
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
