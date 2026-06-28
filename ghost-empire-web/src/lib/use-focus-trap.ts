"use client";
// src/lib/use-focus-trap.ts
// Reusable focus management for modals / popovers — there was no such util in the
// codebase, so overlays (CommandPalette, GiftButton, …) each rolled their own
// half-measure (focus the input, maybe). This hook does the three things a11y needs:
//   1. on open  → move focus inside (caller's initialFocus, else first focusable),
//   2. while open → trap Tab / Shift+Tab inside the container (and fire onEscape),
//   3. on close → RESTORE focus to whatever was focused before opening.
// Attach the returned ref to the container element; pass `active` = is-open.
import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

type Options = {
  /** Called on Escape while trapped (e.g. close the modal). */
  onEscape?: () => void;
  /** Element to focus first; falls back to the first focusable, then the container. */
  initialFocus?: RefObject<HTMLElement | null>;
};

export function useFocusTrap<T extends HTMLElement = HTMLDivElement>(
  active: boolean,
  { onEscape, initialFocus }: Options = {},
): RefObject<T | null> {
  const containerRef = useRef<T>(null);
  // Keep the latest onEscape without re-arming the trap effect each render. Synced in an
  // effect (not during render) so the render stays pure (react-hooks/refs). #733
  const onEscapeRef = useRef(onEscape);
  useEffect(() => {
    onEscapeRef.current = onEscape;
  });

  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    if (!container) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;

    const focusInside = () => {
      const target = initialFocus?.current ?? container.querySelector<HTMLElement>(FOCUSABLE) ?? container;
      target?.focus?.();
    };
    // Defer to the next tick so the container's children are in the DOM.
    const id = window.setTimeout(focusInside, 0);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onEscapeRef.current?.();
        return;
      }
      if (e.key !== "Tab") return;
      const focusables = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
      if (focusables.length === 0) {
        e.preventDefault();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const activeEl = document.activeElement as HTMLElement | null;
      if (e.shiftKey) {
        if (activeEl === first || !container.contains(activeEl)) {
          e.preventDefault();
          last.focus();
        }
      } else if (activeEl === last || !container.contains(activeEl)) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown, true);

    return () => {
      window.clearTimeout(id);
      document.removeEventListener("keydown", onKeyDown, true);
      // Restore focus to where it was before the overlay opened.
      previouslyFocused?.focus?.();
    };
  }, [active, initialFocus]);

  return containerRef;
}
