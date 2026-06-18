// src/lib/view-transition.ts
// Helpers for cross-page View Transitions (the browser View Transitions API).
// TransitionLink wraps a soft navigation in document.startViewTransition so pages
// crossfade instead of cutting. Everything here degrades gracefully: when the API
// is missing or the user prefers reduced motion, callers fall back to a normal
// navigation, so nothing ever breaks.

// Narrow structural type — lib.dom may or may not declare startViewTransition
// depending on the TS version, so we don't depend on it being there.
type DocumentWithViewTransition = Document & {
  startViewTransition?: (callback: () => void) => unknown;
};

/** True if the browser supports the View Transitions API. */
export function supportsViewTransitions(): boolean {
  return (
    typeof document !== "undefined" &&
    typeof (document as DocumentWithViewTransition).startViewTransition === "function"
  );
}

/** True if the user has asked for reduced motion (we then skip transitions entirely). */
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Run `navigate` inside a view transition when possible, otherwise just run it.
 * Always performs the navigation — the transition is pure enhancement.
 */
export function startViewTransitionNavigation(navigate: () => void): void {
  if (!supportsViewTransitions() || prefersReducedMotion()) {
    navigate();
    return;
  }
  (document as DocumentWithViewTransition).startViewTransition!(navigate);
}

type NavClickInfo = {
  defaultPrevented: boolean;
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
};

/**
 * Pure decision: should THIS click be intercepted for an animated soft navigation?
 * We only animate ordinary primary-button clicks that would navigate in-place.
 * A modifier/middle click (open-in-new-tab/window), a target=_blank link, a click
 * something else already handled (defaultPrevented), or a link to the current path
 * are all left to the browser / next-intl's default behavior.
 */
export function shouldAnimateNavigation(
  e: NavClickInfo,
  opts: { targetBlank: boolean; samePath: boolean },
): boolean {
  if (e.defaultPrevented) return false;
  if (e.button !== 0) return false; // primary (left) button only
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return false; // new tab/window/download
  if (opts.targetBlank) return false;
  if (opts.samePath) return false; // already here — nothing to transition to
  return true;
}
