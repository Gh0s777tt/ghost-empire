"use client";
// src/components/extensions/ExtensionsSection.tsx
// Promo tiles for the browser extensions (NX Companion + NX Chat Tools). Rendered on the
// dedicated /rozszerzenia page and — in `compact` mode — on the home page. Bilingual inline
// (PL/EN via useLocale) so it touches NO locale files. Data lives in @/lib/extensions.
import { useLocale } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Check, ChevronRight, Puzzle } from "lucide-react";
import { EXTENSIONS, fillBranding, type Extension, type Bi } from "@/lib/extensions";
import { useTenantBranding } from "@/components/TenantBranding";

type Brand = { tokenName: string; tokenSymbol: string };

const COPY = {
  heading: { pl: "Rozszerzenia przeglądarkowe", en: "Browser extensions" },
  sub: {
    pl: "Zabierz portal na streamy Twitch i Kick — bez otwierania nowej karty.",
    en: "Bring the portal onto Twitch & Kick streams — without opening a new tab.",
  },
  soon: { pl: "Wkrótce", en: "Coming soon" },
  soonNote: {
    pl: "Publikacja w sklepach Chrome i Firefox w przygotowaniu.",
    en: "Chrome & Firefox store release in the works.",
  },
  chrome: { pl: "Chrome", en: "Chrome" },
  firefox: { pl: "Firefox", en: "Firefox" },
  seeAll: { pl: "Zobacz rozszerzenia", en: "See extensions" },
  free: { pl: "Za darmo · open-source", en: "Free · open-source" },
} as const;

function pick(b: Bi, locale: string): string {
  return locale.startsWith("pl") ? b.pl : b.en;
}

/** Neither browser has a lucide glyph in this version — tiny inline marks keep us
 *  icon-consistent without shipping raster assets. */
function ChromeMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="12" r="3.2" stroke="currentColor" strokeWidth="2" />
      <path d="M12 8.8h8M12 8.8 8.1 5.7M9.2 13.9 5.2 20M14.8 13.9 18.8 20" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function FirefoxMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M12 3a9 9 0 106.4 15.3c-1 .5-2.2.7-3.4.5 2.6-1 4-3.2 3.7-5.7-.3-2-1.9-3-3.9-3.4-1.3-.3-2-1-2-1.9 0-.8.6-1.5 1.6-1.7-1.6-.6-3.4-.2-4.6 1-1 .9-1.5 2.2-1.5 3.6 0 .6-.4.9-.8.6C4 12.5 4.2 9.6 6 7.3A9 9 0 0112 3z"
        fill="currentColor"
      />
    </svg>
  );
}

function StoreButtons({ ext, locale }: { ext: Extension; locale: string }) {
  if (!ext.chromeUrl && !ext.firefoxUrl) {
    return (
      <span
        className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-bold tracking-wider uppercase
                   border border-zinc-700 text-zinc-400 clip-corner"
        title={pick(COPY.soonNote, locale)}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
        {pick(COPY.soon, locale)}
      </span>
    );
  }
  return (
    <div className="flex flex-wrap gap-2">
      {ext.chromeUrl && (
        <a
          href={ext.chromeUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white
                     bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 clip-corner transition-colors"
        >
          <ChromeMark className="w-3.5 h-3.5" /> {pick(COPY.chrome, locale)}
        </a>
      )}
      {ext.firefoxUrl && (
        <a
          href={ext.firefoxUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white
                     bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 clip-corner transition-colors"
        >
          <FirefoxMark className="w-3.5 h-3.5" /> {pick(COPY.firefox, locale)}
        </a>
      )}
    </div>
  );
}

function ExtensionCard({ ext, locale, brand, index }: { ext: Extension; locale: string; brand: Brand; index: number }) {
  return (
    <div
      className="group relative border border-zinc-800 bg-zinc-950/60 clip-corner p-5 flex flex-col gap-4
                 hover:border-zinc-700 transition-colors animate-fade-in-up"
      style={{ animationDelay: `${index * 90}ms` }}
    >
      {/* accent glow on hover */}
      <div
        className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ background: `radial-gradient(120% 80% at 0% 0%, ${ext.accent}14, transparent 60%)` }}
      />
      <div className="relative flex items-center gap-3">
        <div
          className="w-11 h-11 shrink-0 grid place-items-center text-2xl clip-corner border"
          style={{ borderColor: `${ext.accent}55`, background: `${ext.accent}12` }}
        >
          {ext.emoji}
        </div>
        <div className="min-w-0">
          <h3 className="font-display text-lg tracking-wider text-white truncate">{ext.name}</h3>
          <p className="text-[11px] font-mono uppercase tracking-wider" style={{ color: ext.accent }}>
            {pick(COPY.free, locale)}
          </p>
        </div>
      </div>

      <p className="relative text-sm text-zinc-400 leading-relaxed">{fillBranding(pick(ext.tagline, locale), brand)}</p>

      <ul className="relative space-y-1.5">
        {ext.features.map((f, i) => (
          <li key={i} className="flex items-start gap-2 text-xs text-zinc-300">
            <Check className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: ext.accent }} />
            <span>{fillBranding(pick(f, locale), brand)}</span>
          </li>
        ))}
      </ul>

      <div className="relative mt-auto pt-1">
        <StoreButtons ext={ext} locale={locale} />
      </div>
    </div>
  );
}

type Props = {
  /** compact = home teaser (heading + tiles + "see all" link). Full page omits the link. */
  compact?: boolean;
  className?: string;
};

export function ExtensionsSection({ compact = false, className = "" }: Props) {
  const locale = useLocale();
  const { tokenName, tokenSymbol } = useTenantBranding();
  const brand: Brand = { tokenName, tokenSymbol };
  return (
    <section className={className} aria-label={pick(COPY.heading, locale)}>
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <Puzzle className="w-5 h-5 text-red-500" />
          <div>
            <h2 className="font-display text-xl tracking-wider text-white">{pick(COPY.heading, locale)}</h2>
            <p className="text-xs text-zinc-500">{pick(COPY.sub, locale)}</p>
          </div>
        </div>
        {compact && (
          <Link
            href="/rozszerzenia"
            className="shrink-0 inline-flex items-center gap-1 text-[11px] font-bold tracking-wider
                       text-zinc-400 hover:text-red-400 transition-colors"
          >
            {pick(COPY.seeAll, locale)} <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {EXTENSIONS.map((ext, i) => (
          <ExtensionCard key={ext.id} ext={ext} locale={locale} brand={brand} index={i} />
        ))}
      </div>
    </section>
  );
}
