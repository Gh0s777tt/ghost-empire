"use client";
// src/components/SocialLinks.tsx
// Branded social media link cards for streamer's official channels.
import { YoutubeIcon, InstagramIcon } from "@/components/BrandIcons";

type SocialPlatform = {
  id: string;
  name: string;
  handle: string;
  href: string;
  color: string;        // Brand color
  gradient: string;     // Brand gradient
  iconType: "svg" | "emoji";
  icon: string;
  description: string;
};

export const SOCIALS: SocialPlatform[] = [
  {
    id: "discord",
    name: "Discord",
    handle: "Dołącz na serwer",
    href: "https://discord.gg/deAPJ9Ym2F",
    color: "#5865F2",
    gradient: "linear-gradient(135deg, #5865F2 0%, #404EED 100%)",
    iconType: "svg",
    icon: "discord",
    description: "Społeczność, eventy, drop codes",
  },
  {
    id: "twitch",
    name: "Twitch",
    handle: "@gh0s77tt",
    href: "https://twitch.tv/gh0s77tt",
    color: "#9146FF",
    gradient: "linear-gradient(135deg, #9146FF 0%, #6441A4 100%)",
    iconType: "svg",
    icon: "twitch",
    description: "Live streamy",
  },
  {
    id: "kick",
    name: "Kick",
    handle: "@gh0s77tt",
    href: "https://kick.com/gh0s77tt",
    color: "#53FC18",
    gradient: "linear-gradient(135deg, #53FC18 0%, #2E9E0A 100%)",
    iconType: "svg",
    icon: "kick",
    description: "Drugi stream channel",
  },
  {
    id: "youtube",
    name: "YouTube",
    handle: "@Gh0s77tt",
    href: "https://www.youtube.com/@Gh0s77tt",
    color: "#FF0000",
    gradient: "linear-gradient(135deg, #FF0000 0%, #B30000 100%)",
    iconType: "svg",
    icon: "youtube",
    description: "VODy, highlighty",
  },
  {
    id: "tiktok",
    name: "TikTok",
    handle: "@gh0s77tt",
    href: "https://www.tiktok.com/@gh0s77tt",
    color: "#FE2C55",
    gradient: "linear-gradient(135deg, #FE2C55 0%, #25F4EE 100%)",
    iconType: "svg",
    icon: "tiktok",
    description: "Klipy, momenty",
  },
  {
    id: "instagram",
    name: "Instagram",
    handle: "@gh0s77tt",
    href: "https://www.instagram.com/gh0s77tt/",
    color: "#E4405F",
    gradient: "linear-gradient(135deg, #833AB4 0%, #FD1D1D 50%, #FCB045 100%)",
    iconType: "svg",
    icon: "instagram",
    description: "Zdjęcia, stories",
  },
  {
    id: "x",
    name: "X",
    handle: "@Gh0s77tt",
    href: "https://x.com/Gh0s77tt",
    color: "#000000",
    gradient: "linear-gradient(135deg, #000000 0%, #1A1A1A 100%)",
    iconType: "svg",
    icon: "x",
    description: "Update'y, ogłoszenia",
  },
];

function PlatformIcon({ platform }: { platform: SocialPlatform }) {
  // All brand marks are self-hosted SVGs (lucide dropped official logos in v1).
  const className = "w-7 h-7 text-white";
  switch (platform.icon) {
    case "youtube":
      return <YoutubeIcon className={className} />;
    case "instagram":
      return <InstagramIcon className={className} />;
    case "discord":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="currentColor">
          <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
        </svg>
      );
    case "twitch":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="currentColor">
          <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z"/>
        </svg>
      );
    case "kick":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="currentColor">
          <path d="M1.714 0v24h6.857v-5.486h2.286v3.2h2.286V24h6.857v-6.857h-2.286V14.857h-2.286v-2.285h2.286V9.43h2.286V0h-6.857v6.857h-2.286V9.43H8.57V6.857H8.57V0z"/>
        </svg>
      );
    case "tiktok":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="currentColor">
          <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/>
        </svg>
      );
    case "x":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="currentColor">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
        </svg>
      );
  }
  return null;
}

export function SocialLinksGrid() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {SOCIALS.map((s) => (
        <a
          key={s.id}
          href={s.href}
          target="_blank"
          rel="noreferrer"
          className="group relative overflow-hidden border border-zinc-800 bg-zinc-950/70 backdrop-blur-xs p-4 hover:border-transparent transition-all"
          style={{
            clipPath:
              "polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 10px 100%, 0 calc(100% - 10px))",
          }}
        >
          {/* Brand-color gradient overlay on hover */}
          <div
            className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ background: s.gradient }}
          />
          {/* Subtle brand glow on hover */}
          <div
            className="absolute -inset-px opacity-0 group-hover:opacity-30 blur-xl transition-opacity"
            style={{ background: s.color }}
          />

          <div className="relative flex items-center gap-3">
            <div
              className="w-12 h-12 flex items-center justify-center shrink-0 transition-all group-hover:scale-110"
              style={{ background: s.gradient }}
            >
              <PlatformIcon platform={s} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2 mb-0.5">
                <h3 className="text-white font-bold text-sm sm:text-base">{s.name}</h3>
                <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 group-hover:text-white/80 transition-colors">
                  {s.handle}
                </span>
              </div>
              <p className="text-zinc-500 text-xs group-hover:text-white/90 transition-colors">
                {s.description}
              </p>
            </div>
            <div className="text-zinc-600 group-hover:text-white transition-colors shrink-0">
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M7 17l9.2-9.2M17 17V7H7" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
          </div>
        </a>
      ))}
    </div>
  );
}

/** Compact horizontal row for footers / sidebars */
export function SocialLinksRow() {
  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      {SOCIALS.map((s) => (
        <a
          key={s.id}
          href={s.href}
          target="_blank"
          rel="noreferrer"
          title={`${s.name} ${s.handle}`}
          className="group w-9 h-9 flex items-center justify-center border border-zinc-800 hover:border-transparent transition-all"
          style={{ background: "rgba(0,0,0,0.4)" }}
          onMouseEnter={(e) => { e.currentTarget.style.background = s.gradient; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(0,0,0,0.4)"; }}
        >
          <div className="text-zinc-400 group-hover:text-white transition-colors">
            <PlatformIcon platform={s} />
          </div>
        </a>
      ))}
    </div>
  );
}
