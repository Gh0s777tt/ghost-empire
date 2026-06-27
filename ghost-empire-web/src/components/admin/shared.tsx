// src/components/admin/shared.tsx
// Shared admin UI primitives, hoisted out of the AdminClient monolith so section
// components can live in their own (lazily-loaded) modules and import them.
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Search, X } from "lucide-react";
import { EmojiPicker } from "@/components/EmojiPicker";

export function SectionCard({
  title, icon: Icon, children,
}: { title: string; icon: LucideIcon; children: ReactNode }) {
  // Direction B — "Cinematic Mono" (#692): a flat control-room panel with a hairline
  // header, a single red "cut" accent and wide-tracked mono title (no neon glow).
  return (
    <section className="cine-card">
      <div className="cine-card-head">
        <span className="cine-cut" aria-hidden />
        <Icon className="w-4 h-4 text-zinc-400" />
        <h2 className="font-display text-lg text-white tracking-[0.18em]">{title.toUpperCase()}</h2>
      </div>
      <div className="p-5 pt-4">{children}</div>
    </section>
  );
}

export function FieldInput({
  label, value, onChange, placeholder, type = "text", min, max, step,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <div>
      <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-1">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        // Forward numeric bounds so number fields constrain input in-browser (#audit-v2).
        {...(min !== undefined ? { min } : {})}
        {...(max !== undefined ? { max } : {})}
        {...(step !== undefined ? { step } : {})}
        className="w-full border border-zinc-800 bg-black/30 px-3 py-2 text-sm text-white font-mono outline-hidden focus:border-red-600 placeholder:text-zinc-700"
      />
    </div>
  );
}

/**
 * Client-side search box for long admin lists (#audit3). Presentational (no hooks) so it
 * stays usable from this server-compatible module — the section owns the query state and
 * passes a localized placeholder. Shows a clear (✕) button + an optional "shown/total" count.
 */
export function ListSearch({
  value, onChange, placeholder, shown, total,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  shown?: number;
  total?: number;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="relative flex-1">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-600 pointer-events-none" />
        <input
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
          className="w-full border border-zinc-800 bg-black/30 pl-8 pr-8 py-2 text-sm text-white outline-hidden focus:border-red-600 placeholder:text-zinc-700"
        />
        {value && (
          <button
            type="button"
            onClick={() => onChange("")}
            aria-label="✕"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-white"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      {value && total !== undefined && (
        <span className="text-[10px] font-mono text-zinc-500 shrink-0 tabular-nums">{shown ?? 0}/{total}</span>
      )}
    </div>
  );
}

export function FieldTextarea({
  label, value, onChange, emoji = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  emoji?: boolean;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block">
          {label}
        </label>
        {emoji && <EmojiPicker onPick={(e) => onChange(value + e)} />}
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={2}
        className="w-full border border-zinc-800 bg-black/30 px-3 py-2 text-sm text-white outline-hidden focus:border-red-600 resize-y"
      />
    </div>
  );
}
