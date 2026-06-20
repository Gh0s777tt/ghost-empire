"use client";
// src/components/support/SponsorStrip.tsx
// Public "Sponsors / Partners" strip on /support (#538) — the streamer's brand
// partners (managed in /admin#sponsors), logos linking out. Hidden when empty.
// Links carry rel="sponsored" (correct signal for paid/partner links).
import { useTranslations } from "next-intl";
import { Handshake } from "lucide-react";

type Sponsor = { name: string; url: string; logoUrl: string | null; note: string | null; tier: string | null; featured: boolean };

export function SponsorStrip({ sponsors }: { sponsors: Sponsor[] }) {
  const t = useTranslations("support");
  if (sponsors.length === 0) return null;
  return (
    <div className="mt-8">
      <h2 className="text-[10px] uppercase tracking-widest text-zinc-500 mb-3 flex items-center justify-center gap-1.5">
        <Handshake className="w-3 h-3" /> {t("sponsorsTitle")}
      </h2>
      <div className="flex flex-wrap items-center justify-center gap-3">
        {sponsors.map((s, i) => (
          <a
            key={i}
            href={s.url}
            target="_blank"
            rel="noreferrer sponsored"
            title={s.note || s.name}
            className={`inline-flex items-center gap-2 border rounded-xl px-3 py-2 transition-colors ${s.featured ? "border-amber-600/50 bg-amber-950/10" : "border-zinc-800 bg-black/30 hover:border-zinc-600"}`}
          >
            {s.logoUrl ? (
              <>
                <img src={s.logoUrl} alt={s.name} className="h-7 max-w-[120px] object-contain" />
                <span className="sr-only">{s.name}</span>
              </>
            ) : (
              <span className="text-sm font-semibold text-zinc-200">{s.name}</span>
            )}
            {s.tier && <span className="text-[9px] font-mono uppercase text-amber-400/80">{s.tier}</span>}
          </a>
        ))}
      </div>
    </div>
  );
}
