"use client";
// src/components/ChangelogList.tsx
// Collapsible changelog used on /about — each entry is a click-to-expand card so the
// list stays compact; the newest entry starts open.
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type ChangelogEntry = { date: string; title: string; items: string[] };

export function ChangelogList({ entries }: { entries: ChangelogEntry[] }) {
  const [openDates, setOpenDates] = useState<Record<string, boolean>>(
    entries[0] ? { [entries[0].date]: true } : {},
  );

  return (
    <div className="space-y-3">
      {entries.map((entry) => {
        const isOpen = !!openDates[entry.date];
        return (
          <div
            key={entry.date}
            className="border border-zinc-800 bg-zinc-950/70 backdrop-blur-xs"
            style={{
              clipPath: "polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 10px 100%, 0 calc(100% - 10px))",
            }}
          >
            <button
              type="button"
              onClick={() => setOpenDates((o) => ({ ...o, [entry.date]: !o[entry.date] }))}
              aria-expanded={isOpen}
              className="w-full flex items-center gap-3 p-4 text-start hover:bg-white/2 transition-colors"
            >
              <span className="font-mono text-[10px] uppercase tracking-widest text-red-400 px-2 py-0.5 border border-red-900/50 shrink-0">
                {entry.date}
              </span>
              <h3 className="font-bold text-white text-sm sm:text-base flex-1 min-w-0">{entry.title}</h3>
              <span className="text-[10px] text-zinc-600 shrink-0 hidden sm:block">{entry.items.length} zmian</span>
              <ChevronDown className={cn("w-4 h-4 text-zinc-500 shrink-0 transition-transform", isOpen && "rotate-180")} />
            </button>
            {isOpen && (
              <ul className="space-y-1.5 px-4 pb-4">
                {entry.items.map((item, i) => (
                  <li key={i} className="text-zinc-400 text-xs flex gap-2">
                    <span className="text-red-600 shrink-0">▸</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}
