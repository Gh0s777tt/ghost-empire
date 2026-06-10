"use client";
// src/components/InfoTip.tsx
// Tiny accessible "?" help popover used to explain a feature in place (what it is /
// why / what you get). Hover or focus shows it on desktop, tap toggles on mobile;
// Esc or an outside tap closes it. Pure CSS positioning — no portal, no library.
import { useEffect, useId, useRef, useState } from "react";

export default function InfoTip({ text, side = "top" }: { text: string; side?: "top" | "bottom" }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const closeEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeEsc);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeEsc);
    };
  }, [open]);

  return (
    <span ref={ref} className="relative inline-flex align-middle" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        aria-label="info"
        onClick={() => setOpen((o) => !o)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="w-4 h-4 rounded-full border border-zinc-600 text-zinc-400 hover:text-amber-300 hover:border-amber-400 focus:text-amber-300 focus:border-amber-400 text-[10px] font-bold leading-none inline-flex items-center justify-center transition-colors outline-hidden"
      >
        ?
      </button>
      {open && (
        <span
          id={id}
          role="tooltip"
          className={`absolute left-1/2 -translate-x-1/2 z-50 w-64 max-w-[75vw] rounded-lg border border-zinc-700 bg-zinc-950/95 backdrop-blur px-3 py-2 text-xs leading-relaxed text-zinc-300 text-start font-normal normal-case tracking-normal shadow-xl ${
            side === "top" ? "bottom-full mb-2" : "top-full mt-2"
          }`}
        >
          {text}
        </span>
      )}
    </span>
  );
}
