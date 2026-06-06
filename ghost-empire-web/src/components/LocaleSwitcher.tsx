"use client";
// src/components/LocaleSwitcher.tsx
// PL/EN toggle with flags. Segmented control — click the inactive language to
// switch on the SAME path (PL → "/", EN → "/en/…"). Flags are inline SVG, not
// emoji (emoji flags don't render on Windows — they show "PL"/"US" letters).
import { useLocale } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

function FlagPL({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 14" className={className} aria-hidden>
      <rect width="20" height="14" fill="#dc143c" />
      <rect width="20" height="7" fill="#ffffff" />
    </svg>
  );
}

function FlagUS({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 14" className={className} aria-hidden>
      <rect width="20" height="14" fill="#b22234" />
      {[1, 3, 5, 7, 9, 11].map((i) => (
        <rect key={i} y={i * (14 / 13)} width="20" height={14 / 13} fill="#ffffff" />
      ))}
      <rect width="8" height={7 * (14 / 13)} fill="#3c3b6e" />
    </svg>
  );
}

const LOCALES = [
  { code: "pl", label: "PL", aria: "Polski", Flag: FlagPL },
  { code: "en", label: "EN", aria: "English", Flag: FlagUS },
] as const;

export function LocaleSwitcher() {
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();

  return (
    <div className="flex items-center border border-zinc-800 divide-x divide-zinc-800" role="group" aria-label="Język / Language">
      {LOCALES.map(({ code, label, aria, Flag }) => {
        const active = locale === code;
        return (
          <button
            key={code}
            type="button"
            onClick={() => { if (!active) router.replace(pathname, { locale: code }); }}
            aria-label={aria}
            aria-pressed={active}
            title={aria}
            className={cn(
              "flex items-center gap-1.5 px-2 py-1.5 text-[10px] font-bold tracking-widest transition-colors",
              active ? "bg-zinc-800 text-white" : "text-zinc-500 hover:text-white hover:bg-white/5",
            )}
          >
            <Flag className="w-4 h-auto shrink-0 rounded-[1px] ring-1 ring-black/40" />
            {label}
          </button>
        );
      })}
    </div>
  );
}
