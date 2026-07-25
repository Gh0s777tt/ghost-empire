// src/components/support/PenaltyList.tsx
// The viewer-facing price list for "kary" (#806). Server component — it renders data the page already
// fetched, so it adds no query and no client JS.
//
// WHY THIS EXISTS AT ALL: the draw is only fair if the odds are visible. A viewer paying for a random
// outcome must be able to see the pool, the weights as real percentages, and what their amount
// unlocks BEFORE they pay. Printing "a random penalty happens" and nothing else would be the shape of
// a black box, which is exactly what the fairness argument for this feature rests on not being.
//
// Renders NOTHING when the portal has penalties switched off or an empty catalogue — a heading
// promising penalties with no list under it is worse than no heading.
//
// Copy is inline PL/EN (the GamblingGate pattern) rather than in the 14 locale files: the feature is
// still switched off by default pending the legal answer, so churning every catalogue for wording that
// may yet change would be premature.

export type PublicPenalty = {
  label: string;
  weight: number;
  minPlnGrosze: number;
  minDurationMs: number;
  maxDurationMs: number;
};

const zl = (grosze: number) => (grosze / 100).toLocaleString("pl-PL", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const secs = (ms: number) => Math.round(ms / 1000);

export function PenaltyList({
  penalties,
  minPlnGrosze,
  locale,
}: {
  penalties: PublicPenalty[];
  minPlnGrosze: number;
  locale: string;
}) {
  if (penalties.length === 0) return null;

  // Odds are shown per TIER, because a tier only adds entries to the pool: a 20 zł donation draws from
  // a different (smaller) pool than a 100 zł one, so a single global percentage would be a lie.
  const tiers = [...new Set(penalties.map((p) => p.minPlnGrosze))].sort((a, b) => a - b);

  const pl = locale.startsWith("pl");
  const copy = pl
    ? {
        title: "🎲 Kary",
        intro: `Od ${zl(minPlnGrosze)} zł system LOSUJE karę z listy poniżej — rodzaj, siłę i czas trwania. Nikt na to nie wpływa, ani Ty, ani streamer.`,
        tier: (v: string) => `od ${v} zł`,
        chance: "szansa",
        dur: "czas",
        note: "Szanse liczone są dla puli, z której losuje Twoja kwota — większa wpłata odblokowuje kolejne pozycje, ale nie zmienia wag tych, które już są w puli.",
      }
    : {
        title: "🎲 Penalties",
        intro: `From ${zl(minPlnGrosze)} zł the system DRAWS a penalty from the list below — its type, strength and duration. Nobody influences it, neither you nor the streamer.`,
        tier: (v: string) => `from ${v} zł`,
        chance: "chance",
        dur: "duration",
        note: "The odds are for the pool YOUR amount draws from — a bigger donation unlocks further entries but never re-weights the ones already in the pool.",
      };

  return (
    <section className="mt-8" aria-labelledby="penalties-heading">
      <h2 id="penalties-heading" className="text-lg font-bold text-white mb-1">
        {copy.title}
      </h2>
      <p className="text-xs text-zinc-400 mb-4 leading-snug">{copy.intro}</p>

      <div className="space-y-4">
        {tiers.map((tier) => {
          // Everything at or below this tier is in the pool at this amount.
          const pool = penalties.filter((p) => p.minPlnGrosze <= tier && p.weight > 0);
          const total = pool.reduce((s, p) => s + p.weight, 0);
          if (total <= 0) return null;
          return (
            <div key={tier} className="border border-zinc-800 bg-black/30">
              <div className="px-3 py-1.5 border-b border-zinc-800 text-[11px] font-bold tracking-widest uppercase text-red-400">
                {copy.tier(zl(tier))}
              </div>
              <ul className="divide-y divide-zinc-900">
                {pool.map((p) => (
                  <li key={`${tier}-${p.label}`} className="px-3 py-2 flex items-baseline justify-between gap-3">
                    <span className="text-sm text-zinc-200 min-w-0 break-words">{p.label}</span>
                    <span className="text-[11px] text-zinc-500 shrink-0 tabular-nums">
                      {Math.round((p.weight / total) * 100)}% {copy.chance} · {secs(p.minDurationMs)}
                      {p.maxDurationMs !== p.minDurationMs ? `–${secs(p.maxDurationMs)}` : ""} s {copy.dur}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      <p className="text-[11px] text-zinc-600 mt-3 leading-snug">{copy.note}</p>
    </section>
  );
}
