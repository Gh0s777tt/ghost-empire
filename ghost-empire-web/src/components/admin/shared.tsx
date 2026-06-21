// src/components/admin/shared.tsx
// Shared admin UI primitives, hoisted out of the AdminClient monolith so section
// components can live in their own (lazily-loaded) modules and import them.
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { EmojiPicker } from "@/components/EmojiPicker";

export function SectionCard({
  title, icon: Icon, children,
}: { title: string; icon: LucideIcon; children: ReactNode }) {
  return (
    <div
      className="border border-zinc-800 bg-zinc-950/80 backdrop-blur-xs p-5"
      style={{
        clipPath:
          "polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 12px 100%, 0 calc(100% - 12px))",
      }}
    >
      <div className="flex items-center gap-2 mb-4">
        <Icon className="w-4 h-4 text-red-500" />
        <h2 className="font-display text-lg text-white tracking-wider">{title.toUpperCase()}</h2>
      </div>
      {children}
    </div>
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
