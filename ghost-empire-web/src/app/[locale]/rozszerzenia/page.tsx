// src/app/[locale]/rozszerzenia/page.tsx
// Public promo page for the browser extensions (NX Companion + NX Chat Tools).
// Pure marketing/awareness — no auth, no DB. Teksty siedzą w `extensions.*` we wszystkich
// 14 locale: strona jest PUBLICZNA, a wcześniejszy inline słownik PL/EN dawał dwunastu
// językom angielski — czego `docs:i18n` nie wykryje, bo kluczy w katalogu w ogóle nie było.
// Markery `%gt%`/`%tokenName%`/`%brandName%` rozwija loader katalogu (`i18n/request.ts`).
import { getTranslations } from "next-intl/server";
import { Header } from "@/components/Header";
import { ExtensionsSection } from "@/components/extensions/ExtensionsSection";
import { ShieldCheck, Zap, Puzzle } from "lucide-react";

// White-label: the description names THIS portal's brand, not the founder's.
export async function generateMetadata() {
  // Tytuł był tu ZAWSZE polski, niezależnie od locale — teraz idzie z katalogu jak reszta.
  // Nazwa portalu wchodzi markerem `%brandName%`, który loader rozwija per tenant.
  const t = await getTranslations("extensions");
  return { title: t("metaTitle"), description: t("metaDesc") };
}

// Trzy kafelki „dlaczego warto" — ikona + para kluczy katalogu. Układ i kolejność zostają
// w kodzie, treść idzie do `messages/*.json`.
const KAFELKI = [
  { icon: "zap", title: "frictionTitle", body: "frictionBody" },
  { icon: "shield", title: "privacyTitle", body: "privacyBody" },
  { icon: "puzzle", title: "ecosystemTitle", body: "ecosystemBody" },
] as const;

const ICONS = { zap: Zap, shield: ShieldCheck, puzzle: Puzzle } as const;

export default async function ExtensionsPage() {
  const t = await getTranslations("extensions");

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
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-red-500 mb-2">{t("kicker")}</p>
          <h1 className="font-display text-3xl sm:text-4xl tracking-wider text-white mb-3">{t("title")}</h1>
          <p className="text-zinc-400 max-w-2xl leading-relaxed">{t("lead")}</p>
        </div>

        {/* Tiles */}
        <ExtensionsSection className="mb-10" />

        {/* Info row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {KAFELKI.map((card, i) => {
            const Icon = ICONS[card.icon as keyof typeof ICONS];
            return (
              <div
                key={i}
                className="border border-zinc-800 bg-zinc-950/60 clip-corner p-4 animate-fade-in-up"
                style={{ animationDelay: `${(i + 2) * 90}ms` }}
              >
                <Icon className="w-5 h-5 text-red-500 mb-2" />
                <h3 className="font-display text-sm tracking-wider text-white mb-1">{t(card.title)}</h3>
                <p className="text-xs text-zinc-400 leading-relaxed">{t(card.body)}</p>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
