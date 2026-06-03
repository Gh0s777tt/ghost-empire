// src/app/welcome/page.tsx
// Landing / first-visit page — a focused hero shown on a visitor's first load
// (see FirstVisitRedirect). Reachable any time at /welcome.
import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { ArrowRight, Coins, Gift, Trophy, MessageSquare, Tv, Radio } from "lucide-react";
import { YoutubeIcon } from "@/components/BrandIcons";
import { SocialLinksRow } from "@/components/SocialLinks";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Witaj w Ghost Empire",
  description: "Jedna tokenowa ekonomia dla Twitch, Kick, YouTube i Discord. Zbieraj Ghost Tokens, wymieniaj na nagrody.",
};

const HIGHLIGHTS = [
  { icon: Coins, color: "#E50914", title: "Ghost Tokens", desc: "Zarabiaj GT za czat, voice, suby, donejty i questy — na każdej platformie." },
  { icon: Gift, color: "#10b981", title: "Prawdziwe nagrody", desc: "Wymieniaj tokeny w sklepie: klucze Steam, skiny, gifted suby, voice z Ghostem." },
  { icon: Trophy, color: "#FFD700", title: "Rywalizacja", desc: "Rankingi, eventy, predictions, battle pass i sezonowe nagrody." },
  { icon: MessageSquare, color: "#8b5cf6", title: "Bot na 3 platformach", desc: "Twitch + Kick + YouTube: komendy, timery, powitania, song requests, overlay." },
];

export default async function WelcomePage() {
  const session = await getServerSession(authOptions);
  const isAuthed = !!session?.user?.id;

  return (
    <div className="min-h-screen bg-black relative overflow-hidden flex flex-col">
      {/* Atmosphere */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-1/4 w-[700px] h-[700px] rounded-full blur-[160px] opacity-20"
          style={{ background: "radial-gradient(circle, #E50914 0%, transparent 70%)" }} />
        <div className="absolute bottom-[-10%] right-0 w-[600px] h-[600px] rounded-full blur-[150px] opacity-10"
          style={{ background: "radial-gradient(circle, #8B0000 0%, transparent 70%)" }} />
      </div>

      <main className="relative z-10 flex-1 flex flex-col items-center justify-center text-center px-4 py-16 max-w-4xl mx-auto">
        {/* Logo */}
        <div className="w-24 h-24 sm:w-28 sm:h-28 mb-6 overflow-hidden rounded-2xl ring-2 ring-red-600/40 shadow-[0_0_60px_rgba(229,9,20,0.35)]">
          <img src="/brand/skull.png" alt="GH0ST EMPIRE" className="w-full h-full object-cover" />
        </div>

        <h1
          className="font-display text-5xl sm:text-7xl text-white tracking-wider mb-4"
          style={{ textShadow: "3px 0 0 rgba(229,9,20,0.7), -3px 0 0 rgba(139,0,0,0.5)" }}
        >
          GH0ST EMPIRE
        </h1>
        <p className="text-zinc-300 text-base sm:text-xl max-w-2xl mb-2">
          Jedna ekonomia dla <span className="text-red-400 font-semibold">Twitch · Kick · YouTube · Discord</span>.
        </p>
        <p className="text-zinc-500 text-sm sm:text-base max-w-xl mb-8">
          Zbieraj <strong className="text-white">Ghost Tokens</strong> za aktywność, wymieniaj na realne nagrody, rywalizuj i wygrywaj eventy.
        </p>

        {/* Platform icons */}
        <div className="flex items-center gap-4 text-zinc-600 mb-10">
          <Tv className="w-5 h-5 hover:text-[#9146FF] transition-colors" />
          <Radio className="w-5 h-5 hover:text-[#53FC18] transition-colors" />
          <YoutubeIcon className="w-5 h-5 hover:text-[#FF0000] transition-colors" />
        </div>

        {/* CTAs */}
        <div className="flex flex-col sm:flex-row items-center gap-3 mb-12">
          {!isAuthed ? (
            <>
              <Link
                href="/auth/signin"
                className="inline-flex items-center gap-2 px-8 py-4 bg-red-600 hover:bg-red-500 text-white font-bold text-sm tracking-widest uppercase transition-all"
              >
                Zaloguj się <ArrowRight className="w-4 h-4" />
              </Link>
              <Link href="/" className="inline-flex items-center gap-2 px-6 py-4 border border-zinc-700 hover:border-zinc-500 text-zinc-300 font-bold text-sm tracking-widest uppercase transition-all">
                Rozejrzyj się
              </Link>
            </>
          ) : (
            <Link
              href="/"
              className="inline-flex items-center gap-2 px-8 py-4 bg-red-600 hover:bg-red-500 text-white font-bold text-sm tracking-widest uppercase transition-all"
            >
              Wejdź do portalu <ArrowRight className="w-4 h-4" />
            </Link>
          )}
        </div>

        {/* Highlights */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full mb-10">
          {HIGHLIGHTS.map((h) => {
            const Icon = h.icon;
            return (
              <div
                key={h.title}
                className="border border-zinc-800 bg-zinc-950/70 backdrop-blur-sm p-4 text-left flex items-start gap-3"
                style={{ clipPath: "polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 10px 100%, 0 calc(100% - 10px))" }}
              >
                <div className="w-9 h-9 flex items-center justify-center shrink-0" style={{ background: h.color + "20", border: `1px solid ${h.color}40` }}>
                  <Icon className="w-4 h-4" style={{ color: h.color }} />
                </div>
                <div>
                  <h3 className="font-bold text-white text-sm">{h.title}</h3>
                  <p className="text-zinc-400 text-xs leading-relaxed mt-0.5">{h.desc}</p>
                </div>
              </div>
            );
          })}
        </div>

        <SocialLinksRow />

        <Link href="/about" className="mt-8 text-xs font-mono uppercase tracking-widest text-zinc-500 hover:text-red-400 transition-colors">
          Dowiedz się więcej →
        </Link>
      </main>
    </div>
  );
}
