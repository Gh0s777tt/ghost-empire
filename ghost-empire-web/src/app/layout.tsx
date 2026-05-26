// src/app/layout.tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { SiteFooter } from "@/components/SiteFooter";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://ghost-empire-web.vercel.app"),
  title: {
    default: "GH0ST EMPIRE",
    template: "%s | GH0ST EMPIRE",
  },
  description:
    "Oficjalny portal społeczności GH0ST EMPIRE. Zbieraj Ghost Tokens, wymieniaj na nagrody, rywalizuj w rankingu.",
  keywords: ["ghost empire", "gh0st", "gh0s77tt", "twitch", "kick", "streaming", "discord", "ghost tokens"],
  authors: [{ name: "Gh0s77tt" }],
  creator: "Gh0s77tt",
  openGraph: {
    title: "GH0ST EMPIRE",
    description: "Oficjalny portal społeczności streamera Gh0s77tt. Ekonomia Ghost Tokens, eventy, sklep, ranking.",
    type: "website",
    locale: "pl_PL",
    siteName: "Ghost Empire",
    url: "https://ghost-empire-web.vercel.app",
  },
  twitter: {
    card: "summary_large_image",
    title: "GH0ST EMPIRE",
    description: "Oficjalny portal społeczności streamera Gh0s77tt",
    creator: "@Gh0s77tt",
  },
  robots: {
    index: true,
    follow: true,
  },
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pl" className="dark">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Anton&family=JetBrains+Mono:wght@400;700&family=Inter:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className={`${inter.variable} font-sans bg-black text-zinc-200 antialiased min-h-screen flex flex-col`}>
        <Providers>
          <div className="flex-1 flex flex-col">{children}</div>
          <SiteFooter />
        </Providers>
      </body>
    </html>
  );
}
