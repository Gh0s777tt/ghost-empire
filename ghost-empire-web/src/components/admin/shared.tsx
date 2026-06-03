// src/components/admin/shared.tsx
// Shared admin UI primitives, hoisted out of the AdminClient monolith so section
// components can live in their own (lazily-loaded) modules and import them.
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

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
