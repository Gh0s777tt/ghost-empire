"use client";
// src/components/home/GettingStarted.tsx
// "Getting started" checklist on the home dashboard — surfaces the core loop to
// new viewers (link a platform, claim the daily bonus, join a clan, vote on a
// clip) with live progress. Self-fetches /api/getting-started and HIDES itself
// once every step is done, so it never clutters an established account.
import { useState, useEffect } from "react";
import { Check, Circle, Link2, Gift, Users, Film, ChevronRight, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { apiGet } from "@/lib/api-client";

type Steps = { platform: boolean; daily: boolean; clan: boolean; clip: boolean };

const STEP_DEFS = [
  { key: "platform", href: "/profile", icon: Link2 },
  { key: "daily", href: "/", icon: Gift },
  { key: "clan", href: "/clans", icon: Users },
  { key: "clip", href: "/clips", icon: Film },
] as const;

export function GettingStarted() {
  const t = useTranslations("home");
  const [steps, setSteps] = useState<Steps | null>(null);

  useEffect(() => {
    apiGet<{ steps: Steps }>("/api/getting-started").then((d) => setSteps(d.steps)).catch(() => {});
  }, []);

  if (!steps) return null;
  const done = STEP_DEFS.filter((s) => steps[s.key]).length;
  if (done === STEP_DEFS.length) return null; // all done → hide

  return (
    <div className="border border-zinc-800 bg-zinc-950/60 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-amber-400" />
          <h2 className="font-display text-base text-white tracking-wider">{t("gsTitle")}</h2>
        </div>
        <span className="text-[11px] font-mono text-zinc-500">{t("gsProgress", { done, total: STEP_DEFS.length })}</span>
      </div>
      <div className="h-1.5 bg-zinc-900 rounded-full overflow-hidden mb-3">
        <div className="h-full bg-gradient-to-r from-amber-500 to-red-500 transition-all" style={{ width: `${(done / STEP_DEFS.length) * 100}%` }} />
      </div>
      <div className="space-y-1.5">
        {STEP_DEFS.map((s) => {
          const Icon = s.icon;
          const complete = steps[s.key];
          return (
            <Link
              key={s.key}
              href={s.href}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg border transition-colors ${complete ? "border-emerald-800/40 bg-emerald-950/20" : "border-zinc-800 bg-black/20 hover:border-zinc-600"}`}
            >
              {complete ? <Check className="w-4 h-4 text-emerald-400 shrink-0" /> : <Circle className="w-4 h-4 text-zinc-600 shrink-0" />}
              <Icon className={`w-3.5 h-3.5 shrink-0 ${complete ? "text-emerald-500" : "text-zinc-500"}`} />
              <span className={`text-sm flex-1 ${complete ? "text-zinc-500 line-through" : "text-zinc-200"}`}>{t(`gsStep_${s.key}`)}</span>
              {!complete && <ChevronRight className="w-4 h-4 text-zinc-600 shrink-0" />}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
