// src/app/overlay/layout.tsx
// Root layout for the OBS overlay routes — they are NOT localized (token-gated OBS
// browser sources whose URLs must stay /overlay/*). With the pass-through app root,
// they need their own <html>/<body>. Mirrors the main layout's <body> exactly (same
// classes + fonts) so overlay rendering is unchanged — but WITHOUT app chrome
// (Providers/footer/Analytics): overlays render their own transparent UI.
import { Inter, JetBrains_Mono } from "next/font/google";
import { GOOGLE_FONTS_HREF } from "@/lib/widget-fonts";
import "./overlay.css"; // OBS reset for all /overlay/* routes (#735)

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
  weight: ["400", "700"],
});

export default function OverlayLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pl" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href={GOOGLE_FONTS_HREF} rel="stylesheet" />
      </head>
      <body className={`${inter.variable} ${jetbrainsMono.variable} font-sans bg-black text-zinc-200 antialiased min-h-screen flex flex-col`}>
        {children}
      </body>
    </html>
  );
}
