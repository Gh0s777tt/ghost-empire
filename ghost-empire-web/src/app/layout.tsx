// src/app/layout.tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "GH0ST EMPIRE",
    template: "%s | GH0ST EMPIRE",
  },
  description:
    "Oficjalny portal społeczności GH0ST EMPIRE. Zbieraj Ghost Tokens, wymieniaj na nagrody, rywalizuj w rankingu.",
  keywords: ["ghost empire", "gh0st", "twitch", "kick", "streaming", "discord"],
  openGraph: {
    title: "GH0ST EMPIRE",
    description: "Oficjalny portal społeczności streamera Gh0s77tt",
    type: "website",
    locale: "pl_PL",
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
      <body className={`${inter.variable} font-sans bg-black text-zinc-200 antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
