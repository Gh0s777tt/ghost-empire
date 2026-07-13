"use client";
// Flips the display-fonts stylesheet from media="print" (non-render-blocking) to "all"
// once mounted. Runs in a useEffect (post-hydration), so it never causes a hydration
// mismatch and needs no inline script / CSP nonce. The fonts are for widgets/overlays/
// chat, not viewer body text (next/font Inter), so applying them a tick after paint is
// exactly the intent. Renders nothing.
import { useEffect } from "react";

export function FontSwap() {
  useEffect(() => {
    const link = document.getElementById("nx-display-fonts") as HTMLLinkElement | null;
    if (link && link.media !== "all") link.media = "all";
  }, []);
  return null;
}
