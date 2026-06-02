// src/components/SiteFooter.tsx
// Persistent footer on every page — quick access to legal pages and streamer socials.
import Link from "next/link";
import { SocialLinksRow } from "@/components/SocialLinks";

export function SiteFooter() {
  return (
    <footer
      className="relative z-30 border-t border-zinc-900 bg-zinc-950/95 backdrop-blur-md mt-auto"
      style={{
        boxShadow: "0 -4px 30px rgba(0,0,0,0.6)",
      }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          {/* Left — branding */}
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 flex-shrink-0 overflow-hidden rounded ring-1 ring-red-600/40 bg-black">
              <img src="/brand/skull.png" alt="" className="w-full h-full object-cover" />
            </div>
            <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">
              GH0ST EMPIRE © 2026 · Portal społeczności Gh0s77tt
            </div>
          </div>

          {/* Center — social icons */}
          <div className="flex justify-center">
            <SocialLinksRow />
          </div>

          {/* Right — legal links */}
          <nav className="flex flex-wrap items-center justify-center md:justify-end gap-x-4 gap-y-1.5 text-[10px] font-mono uppercase tracking-widest">
            <Link href="/about" className="text-zinc-500 hover:text-red-400 transition-colors">
              O nas
            </Link>
            <span className="text-zinc-800">·</span>
            <Link href="/privacy" className="text-zinc-500 hover:text-red-400 transition-colors">
              Polityka prywatności
            </Link>
            <span className="text-zinc-800">·</span>
            <Link href="/terms" className="text-zinc-500 hover:text-red-400 transition-colors">
              Regulamin
            </Link>
          </nav>
        </div>
      </div>
    </footer>
  );
}
