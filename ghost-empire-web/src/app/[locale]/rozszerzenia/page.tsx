// src/app/[locale]/rozszerzenia/page.tsx
// Public promo page for the browser extensions (NX Companion + NX Chat Tools).
// Pure marketing/awareness — no auth, no DB. Content is bilingual inline (PL/EN) via
// the ExtensionsSection + a small locale-aware intro/info block below (no locale files).
import { getLocale } from "next-intl/server";
import { Header } from "@/components/Header";
import { ExtensionsSection } from "@/components/extensions/ExtensionsSection";
import { ShieldCheck, Zap, Puzzle } from "lucide-react";

export const metadata = {
  title: "Rozszerzenia przeglądarkowe",
  description: "NX Companion i NX Chat Tools — portal Ghost Empire prosto na streamach Twitch i Kick.",
};

const T = {
  kicker: { pl: "Ekosystem", en: "Ecosystem" },
  title: { pl: "Rozszerzenia przeglądarkowe", en: "Browser extensions" },
  lead: {
    pl: "Dwa lekkie dodatki do przeglądarki, które przenoszą portal wprost na streamy — saldo GT, questy i narzędzia moderacji bez przełączania kart.",
    en: "Two lightweight browser add-ons that bring the portal onto the stream itself — GT balance, quests and mod tools without tab-switching.",
  },
  info: [
    {
      icon: "zap",
      title: { pl: "Zero tarcia", en: "Zero friction" },
      body: {
        pl: "Overlay pojawia się na Twitchu i Kicku. Odbierasz questy i drop-code'y tam, gdzie oglądasz.",
        en: "The overlay sits on Twitch and Kick. Claim quests and drop-codes right where you watch.",
      },
    },
    {
      icon: "shield",
      title: { pl: "Prywatność i bezpieczeństwo", en: "Privacy & safety" },
      body: {
        pl: "Minimalne uprawnienia, żadnej sprzedaży danych, kod open-source. Działa tylko na obsługiwanych czatach.",
        en: "Minimal permissions, no data selling, open-source code. Runs only on supported chats.",
      },
    },
    {
      icon: "puzzle",
      title: { pl: "Część ekosystemu", en: "Part of the ecosystem" },
      body: {
        pl: "Te same konta i te same Ghost Tokens co na portalu — rozszerzenia to nakładka, nie osobny świat.",
        en: "Same accounts and same Ghost Tokens as the portal — the extensions are a layer, not a separate world.",
      },
    },
  ],
} as const;

const ICONS = { zap: Zap, shield: ShieldCheck, puzzle: Puzzle } as const;

export default async function ExtensionsPage() {
  const locale = await getLocale();
  const pick = (b: { pl: string; en: string }) => (locale.startsWith("pl") ? b.pl : b.en);

  return (
    <div className="min-h-screen bg-black">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute top-1/4 left-1/3 w-[600px] h-[600px] rounded-full blur-[150px] opacity-15"
          style={{ background: "radial-gradient(circle, var(--brand) 0%, transparent 70%)" }}
        />
      </div>

      <Header />

      <main className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pb-24 pt-6">
        {/* Hero */}
        <div className="mb-8 animate-fade-in-up">
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-red-500 mb-2">{pick(T.kicker)}</p>
          <h1 className="font-display text-3xl sm:text-4xl tracking-wider text-white mb-3">{pick(T.title)}</h1>
          <p className="text-zinc-400 max-w-2xl leading-relaxed">{pick(T.lead)}</p>
        </div>

        {/* Tiles */}
        <ExtensionsSection className="mb-10" />

        {/* Info row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {T.info.map((card, i) => {
            const Icon = ICONS[card.icon as keyof typeof ICONS];
            return (
              <div
                key={i}
                className="border border-zinc-800 bg-zinc-950/60 clip-corner p-4 animate-fade-in-up"
                style={{ animationDelay: `${(i + 2) * 90}ms` }}
              >
                <Icon className="w-5 h-5 text-red-500 mb-2" />
                <h3 className="font-display text-sm tracking-wider text-white mb-1">{pick(card.title)}</h3>
                <p className="text-xs text-zinc-400 leading-relaxed">{pick(card.body)}</p>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
