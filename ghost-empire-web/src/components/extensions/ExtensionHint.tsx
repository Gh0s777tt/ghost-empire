"use client";
// src/components/extensions/ExtensionHint.tsx
// Contextual "did you know there's an extension for this?" panel. Dropped onto pages whose
// job overlaps an extension (e.g. /companion → NX Companion, mod tools → NX Chat Tools).
// Bilingual inline (PL/EN) — no locale files. Links to the full /rozszerzenia promo page.
import { useLocale } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ArrowRight } from "lucide-react";
import { EXTENSIONS, fillBranding, type Bi } from "@/lib/extensions";
import { useTenantBranding } from "@/components/TenantBranding";

const COPY = {
  eyebrow: { pl: "Jest na to rozszerzenie", en: "There's an extension for this" },
  cta: { pl: "Zobacz rozszerzenia", en: "See extensions" },
  soon: { pl: "Wkrótce w sklepach", en: "Coming soon to stores" },
} as const;

function pick(b: Bi, locale: string): string {
  return locale.startsWith("pl") ? b.pl : b.en;
}

/** `extId` must match an EXTENSIONS[].id; renders nothing if unknown (fail-safe). */
export function ExtensionHint({ extId, className = "" }: { extId: string; className?: string }) {
  const locale = useLocale();
  const { tokenName, tokenSymbol } = useTenantBranding();
  const ext = EXTENSIONS.find((e) => e.id === extId);
  if (!ext) return null;
  const unpublished = !ext.chromeUrl && !ext.firefoxUrl;

  return (
    <Link
      href="/rozszerzenia"
      className={`group flex items-center gap-3 border border-zinc-800 bg-zinc-950/60 clip-corner p-4
                  hover:border-zinc-700 transition-colors ${className}`}
      style={{ boxShadow: `inset 3px 0 0 ${ext.accent}` }}
    >
      <span className="text-2xl shrink-0">{ext.emoji}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-mono uppercase tracking-widest" style={{ color: ext.accent }}>
          {pick(COPY.eyebrow, locale)}
        </p>
        <p className="text-sm font-bold text-white truncate">{ext.name}</p>
        <p className="text-xs text-zinc-400 truncate">
          {fillBranding(pick(ext.tagline, locale), { tokenName, tokenSymbol })}
          {unpublished && <span className="ms-1 text-zinc-500">· {pick(COPY.soon, locale)}</span>}
        </p>
      </div>
      <span className="shrink-0 inline-flex items-center gap-1 text-[11px] font-bold tracking-wider text-zinc-400 group-hover:text-red-400 transition-colors">
        {pick(COPY.cta, locale)} <ArrowRight className="w-3.5 h-3.5" />
      </span>
    </Link>
  );
}
