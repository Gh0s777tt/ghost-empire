"use client";
// src/components/admin/CommandPalette.tsx
// Ctrl/Cmd+K (or the search button) opens a quick-jump palette over the admin sections.
// Type to filter, ↑/↓ to move, Enter/click to jump. Decoupled via a window event so any
// button can open it (e.g. the nav search button) without prop-drilling.
import { useState, useEffect, useRef } from "react";
import { Search, CornerDownLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

const OPEN_EVENT = "ge:command-palette";

export function openCommandPalette() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(OPEN_EVENT));
}

export function CommandPalette<T extends string>({
  sections, onSelect,
}: {
  sections: Array<{ id: T; label: string; icon: LucideIcon; group: string }>;
  onSelect: (id: T) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    }
    function onOpen() { setOpen(true); }
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_EVENT, onOpen);
    };
  }, []);

  useEffect(() => {
    if (open) { setQ(""); setIdx(0); const t = setTimeout(() => inputRef.current?.focus(), 20); return () => clearTimeout(t); }
  }, [open]);

  const query = q.trim().toLowerCase();
  const filtered = query ? sections.filter((s) => s.label.toLowerCase().includes(query) || s.group.includes(query)) : sections;

  useEffect(() => { setIdx(0); }, [q]);

  if (!open) return null;

  function choose(id: T) { onSelect(id); setOpen(false); }

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-xs flex items-start justify-center pt-[14vh] px-4"
      onClick={() => setOpen(false)}
      role="dialog"
      aria-modal="true"
      aria-label="Szybkie wyszukiwanie sekcji"
    >
      <div className="w-full max-w-lg border border-zinc-700 bg-zinc-950 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-zinc-800 px-3 py-2.5">
          <Search className="w-4 h-4 text-zinc-500 shrink-0" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setIdx((i) => Math.min(i + 1, filtered.length - 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setIdx((i) => Math.max(i - 1, 0)); }
              else if (e.key === "Enter") { e.preventDefault(); const s = filtered[idx]; if (s) choose(s.id); }
            }}
            placeholder="Skocz do sekcji…"
            className="flex-1 bg-transparent text-sm text-white outline-hidden placeholder:text-zinc-600"
          />
          <kbd className="text-[9px] font-mono text-zinc-600 border border-zinc-800 px-1.5 py-0.5">ESC</kbd>
        </div>
        <div className="max-h-72 overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <div className="px-3 py-5 text-xs text-zinc-600 text-center">Brak wyników dla „{q}"</div>
          ) : (
            filtered.map((s, i) => {
              const Icon = s.icon;
              return (
                <button
                  key={s.id}
                  onClick={() => choose(s.id)}
                  onMouseMove={() => setIdx(i)}
                  className={cn(
                    "w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors",
                    i === idx ? "bg-red-950/40 text-white" : "text-zinc-300",
                  )}
                >
                  <Icon className={cn("w-4 h-4 shrink-0", i === idx ? "text-red-400" : "text-zinc-500")} />
                  <span className="flex-1">{s.label}</span>
                  <span className="text-[9px] font-mono uppercase tracking-widest text-zinc-600">{s.group}</span>
                  {i === idx && <CornerDownLeft className="w-3 h-3 text-zinc-500" />}
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
