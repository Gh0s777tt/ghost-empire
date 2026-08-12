"use client";
// src/components/admin/sections/FeatureSettings.tsx
// „Funkcje portalu" — the per-streamer feature SWITCHBOARD. Renders src/lib/feature-catalog.ts
// grouped into collapsible categories; each row is a title + one-line description + an on/off
// switch. Toggling PATCHes /api/admin/feature-flags (optimistic, reverts on error). A feature the
// portal's PLAN does not include is shown but LOCKED (with an upgrade hint) — that separates
// "owner turned it off" from "plan doesn't include it". This section is deliberately NOT itself
// gateable (you must always be able to reach the switchboard).
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Gamepad2, Coins, LayoutGrid, Users, Bot, Plug, Lightbulb, ChevronDown, Lock, Loader2, SlidersHorizontal,
} from "lucide-react";
import { apiGet, apiPatch } from "@/lib/api-client";
import {
  FEATURE_CATALOG, FEATURE_CATEGORIES, resolvedFlag, type FeatureCategory,
} from "@/lib/feature-catalog";
import { planHasFeature, type Plan } from "@/lib/entitlements-core";

const CATEGORY_ICON: Record<FeatureCategory, typeof Gamepad2> = {
  games: Gamepad2,
  economy: Coins,
  overlays: LayoutGrid,
  community: Users,
  bot: Bot,
  integrations: Plug,
  lighting: Lightbulb,
};

type State = { featureFlags: Record<string, boolean>; plan: Plan };

export function FeatureSettingsManager({ onToast }: { onToast: (k: "ok" | "err", m: string) => void }) {
  const t = useTranslations("admin");
  const [state, setState] = useState<State | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<FeatureCategory>>(new Set());

  useEffect(() => {
    let alive = true;
    apiGet<State>("/api/admin/feature-flags")
      .then((d) => alive && setState({ featureFlags: d.featureFlags ?? {}, plan: d.plan }))
      .catch(() => alive && onToast("err", t("featLoadError")));
    return () => {
      alive = false;
    };
    // onToast/t are stable enough; fetch once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const byCategory = useMemo(() => {
    const m = new Map<FeatureCategory, typeof FEATURE_CATALOG>();
    for (const cat of FEATURE_CATEGORIES) m.set(cat, FEATURE_CATALOG.filter((r) => r.category === cat));
    return m;
  }, []);

  const toggle = useCallback(
    async (key: string, next: boolean) => {
      if (!state) return;
      const prev = state.featureFlags;
      // optimistic
      setState({ ...state, featureFlags: { ...prev, [key]: next } });
      setSaving(key);
      try {
        await apiPatch("/api/admin/feature-flags", { [key]: next });
      } catch {
        setState({ ...state, featureFlags: prev }); // revert
        onToast("err", t("featSaveError"));
      } finally {
        setSaving((s) => (s === key ? null : s));
      }
    },
    [state, onToast, t],
  );

  if (!state) {
    return (
      <div className="flex items-center gap-2 text-zinc-500 text-sm py-8">
        <Loader2 className="w-4 h-4 animate-spin" /> {t("loading")}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          <SlidersHorizontal className="w-5 h-5 text-red-500" /> {t("secFeatures")}
        </h2>
        <p className="text-sm text-zinc-400 max-w-2xl">{t("featIntro")}</p>
      </header>

      {FEATURE_CATEGORIES.map((cat) => {
        const rows = byCategory.get(cat) ?? [];
        if (rows.length === 0) return null;
        const Icon = CATEGORY_ICON[cat];
        const isCollapsed = collapsed.has(cat);
        const liveCount = rows.filter((r) => resolvedFlag(state.featureFlags, r.key)).length;
        return (
          <section key={cat} className="rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
            <button
              type="button"
              onClick={() =>
                setCollapsed((s) => {
                  const n = new Set(s);
                  if (n.has(cat)) n.delete(cat);
                  else n.add(cat);
                  return n;
                })
              }
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-zinc-800/40 transition"
            >
              <span className="flex items-center gap-2 font-medium text-zinc-100">
                <Icon className="w-4 h-4 text-zinc-400" /> {t(`featCat_${cat}`)}
                <span className="text-xs text-zinc-500 font-normal">
                  {liveCount}/{rows.length}
                </span>
              </span>
              <ChevronDown className={`w-4 h-4 text-zinc-500 transition-transform ${isCollapsed ? "-rotate-90" : ""}`} />
            </button>

            {!isCollapsed && (
              <ul className="divide-y divide-zinc-800/70">
                {rows.map((row) => {
                  const on = resolvedFlag(state.featureFlags, row.key);
                  const planLocked = !!row.planFeature && !planHasFeature(state.plan, row.planFeature);
                  const busy = saving === row.key;
                  return (
                    <li key={row.key} className="flex items-start justify-between gap-4 px-4 py-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-zinc-100">{t(row.label)}</span>
                          {planLocked && (
                            <a
                              href="/premium"
                              className="inline-flex items-center gap-1 text-[11px] text-amber-400 hover:text-amber-300"
                              title={t("featPlanLockedHint")}
                            >
                              <Lock className="w-3 h-3" /> {t("featPlanLocked")}
                            </a>
                          )}
                        </div>
                        <p className="text-xs text-zinc-400 mt-0.5">{t(row.description)}</p>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={on}
                        aria-label={t(row.label)}
                        disabled={planLocked || busy}
                        onClick={() => toggle(row.key, !on)}
                        className={`relative shrink-0 mt-0.5 inline-flex h-6 w-11 items-center rounded-full transition
                          ${on && !planLocked ? "bg-red-600" : "bg-zinc-700"}
                          ${planLocked || busy ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${on ? "translate-x-6" : "translate-x-1"}`}
                        />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
