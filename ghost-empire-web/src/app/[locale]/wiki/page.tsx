// src/app/[locale]/wiki/page.tsx
// Publiczna wiki platformy (#745) — pełny przewodnik po funkcjach + komendy + dev.
import { Header } from "@/components/Header";
import { WikiView } from "@/components/wiki/WikiView";
import { localeAlternates } from "@/i18n/metadata";

export function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  return params.then(({ locale }) => ({
    title: "Wiki — Ghost Empire / E-Forge",
    description: "Kompletny przewodnik po platformie: funkcje dla widzów, panel streamera krok po kroku, komendy czatu i dokumentacja dla developerów.",
    alternates: localeAlternates("/wiki", locale),
  }));
}

export default function WikiPage() {
  return (
    <div className="min-h-screen bg-black">
      <Header />
      <main className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pb-24 pt-8">
        <WikiView />
      </main>
    </div>
  );
}
