"use client";
// src/components/tour/SiteTour.tsx
// Interactive guided tour ("samouczek"), startable anytime from the Header "?" button.
// Spotlights elements marked with data-tour attributes and walks the user through them
// with a translated card (next/back/skip). Steps are declared per-pathname in STEPS;
// targets that are missing or hidden on the current page are skipped automatically.
// No library — the spotlight is one absolutely-positioned div with a huge box-shadow.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";

type Step = { key: string; target?: string };

// Global steps run on every page (after the page-specific ones). Targets live in the Header.
const GLOBAL_STEPS: Step[] = [
  { key: "tokens", target: "tokens" },
  { key: "nav", target: "nav" },
  { key: "drop", target: "drop" },
  { key: "bell", target: "bell" },
  { key: "avatar", target: "avatar" },
];

// Page-specific steps, matched by the pathname segment after the locale.
const PAGE_STEPS: Array<{ match: RegExp; steps: Step[] }> = [
  {
    match: /\/kasyno$/,
    steps: [
      { key: "gamesGrid", target: "kasyno-games" },
      { key: "stake", target: "kasyno-stake" },
      { key: "slots", target: "kasyno-slots" },
      { key: "roulette", target: "kasyno-roulette" },
      { key: "dice", target: "kasyno-dice" },
      { key: "crash", target: "kasyno-crash" },
      { key: "plinko", target: "kasyno-plinko" },
      { key: "mines", target: "kasyno-mines" },
      { key: "leaderboard", target: "kasyno-leaderboard" },
    ],
  },
  { match: /\/wheel$/, steps: [{ key: "wheelSpin", target: "wheel-spin" }] },
  { match: /\/quests$/, steps: [{ key: "questList", target: "quest-list" }] },
  { match: /\/shop$/, steps: [{ key: "shopGrid", target: "shop-grid" }] },
  { match: /\/drops$/, steps: [{ key: "dropRedeem", target: "drop-redeem" }] },
  { match: /\/ranking$/, steps: [{ key: "rankingSort", target: "ranking-sort" }] },
];

const TourContext = createContext<{ start: () => void }>({ start: () => {} });
export const useTour = () => useContext(TourContext);

function isVisible(el: Element): boolean {
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return false;
  const st = window.getComputedStyle(el);
  return st.display !== "none" && st.visibility !== "hidden";
}

// First VISIBLE element for a data-tour name (the same anchor may exist twice,
// e.g. desktop + mobile nav — only one is rendered visibly at a time).
function findTarget(name: string): Element | null {
  for (const el of document.querySelectorAll(`[data-tour="${name}"]`)) if (isVisible(el)) return el;
  return null;
}

function reducedMotion(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export default function TourProvider({ children }: { children: React.ReactNode }) {
  const t = useTranslations("tour");
  const pathname = usePathname();
  const [steps, setSteps] = useState<Step[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [rect, setRect] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  const openPath = useRef<string | null>(null);

  const start = useCallback(() => {
    const page = PAGE_STEPS.find((p) => p.match.test(window.location.pathname))?.steps ?? [];
    const all = [{ key: "welcome" }, ...page, ...GLOBAL_STEPS].filter((s) => !s.target || !!findTarget(s.target));
    openPath.current = window.location.pathname;
    setIdx(0);
    setSteps(all);
  }, []);

  const close = useCallback(() => {
    setSteps(null);
    setRect(null);
    try { localStorage.setItem("ge-tour-done", "1"); } catch {}
  }, []);

  // Close if the route changes mid-tour (targets are gone).
  useEffect(() => {
    if (steps && openPath.current && openPath.current !== window.location.pathname) close();
  }, [pathname, steps, close]);

  const step = steps?.[idx] ?? null;

  // Position the spotlight on the current target (scroll it into view, then measure).
  useEffect(() => {
    if (!step) return;
    let raf = 0;
    const el = step.target ? findTarget(step.target) : null;
    const measure = () => {
      if (!el) { setRect(null); return; }
      const r = el.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    };
    if (el) {
      el.scrollIntoView({ block: "center", behavior: reducedMotion() ? "auto" : "smooth" });
      const id = setTimeout(measure, reducedMotion() ? 50 : 350);
      const onMove = () => { raf = requestAnimationFrame(measure); };
      window.addEventListener("resize", onMove, { passive: true });
      window.addEventListener("scroll", onMove, { passive: true });
      return () => { clearTimeout(id); cancelAnimationFrame(raf); window.removeEventListener("resize", onMove); window.removeEventListener("scroll", onMove); };
    }
    setRect(null);
  }, [step]);

  // Keyboard: Esc closes, arrows navigate.
  useEffect(() => {
    if (!steps) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowRight") setIdx((i) => Math.min(i + 1, steps.length - 1));
      else if (e.key === "ArrowLeft") setIdx((i) => Math.max(i - 1, 0));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [steps, close]);

  const ctx = useMemo(() => ({ start }), [start]);
  const last = steps ? idx === steps.length - 1 : false;

  // Card placement: under the spotlight if there is room, otherwise above; centered when no target.
  const cardStyle: React.CSSProperties = useMemo(() => {
    if (!rect) return { top: "50%", left: "50%", transform: "translate(-50%, -50%)" };
    const margin = 12;
    const below = rect.top + rect.height + margin;
    const spaceBelow = typeof window !== "undefined" ? window.innerHeight - below : 400;
    const top = spaceBelow > 220 ? below : Math.max(margin, rect.top - margin - 200);
    const left = Math.min(Math.max(16, rect.left + rect.width / 2 - 160), (typeof window !== "undefined" ? window.innerWidth : 1000) - 336);
    return { top, left };
  }, [rect]);

  return (
    <TourContext.Provider value={ctx}>
      {children}
      {steps && step && (
        <div className="fixed inset-0 z-[200]" role="dialog" aria-modal="true" aria-label={t("startLabel")}>
          {/* Spotlight (the box-shadow dims everything around the target). No target → plain backdrop. */}
          {rect ? (
            <div
              className="absolute rounded-lg border-2 border-amber-400/90 transition-all duration-200 pointer-events-none"
              style={{ top: rect.top - 6, left: rect.left - 6, width: rect.width + 12, height: rect.height + 12, boxShadow: "0 0 0 9999px rgba(0,0,0,0.78)" }}
            />
          ) : (
            <div className="absolute inset-0 bg-black/80" />
          )}

          {/* Step card */}
          <div className="absolute w-80 max-w-[calc(100vw-32px)] rounded-xl border border-zinc-700 bg-zinc-950 shadow-2xl p-4" style={cardStyle}>
            <div className="flex items-start justify-between gap-3 mb-1.5">
              <h3 className="font-bold text-white text-sm">{t(`steps.${step.key}Title`)}</h3>
              <span className="text-[10px] font-mono text-zinc-500 tabular-nums shrink-0 mt-0.5">{t("progress", { step: idx + 1, total: steps.length })}</span>
            </div>
            <p className="text-xs leading-relaxed text-zinc-300 mb-3">{t(`steps.${step.key}Body`)}</p>
            <div className="flex items-center gap-2">
              <button onClick={close} className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors me-auto">{t("skip")}</button>
              {idx > 0 && (
                <button onClick={() => setIdx((i) => i - 1)} className="px-3 py-1.5 rounded-full text-xs font-bold text-zinc-300 bg-zinc-900 border border-zinc-700 hover:bg-zinc-800 transition-all">
                  {t("back")}
                </button>
              )}
              <button
                onClick={() => (last ? close() : setIdx((i) => i + 1))}
                className="px-4 py-1.5 rounded-full text-xs font-extrabold text-white bg-gradient-to-r from-amber-600 to-red-600 hover:from-amber-500 transition-all"
              >
                {last ? t("done") : t("next")}
              </button>
            </div>
          </div>
        </div>
      )}
    </TourContext.Provider>
  );
}
