// src/components/EmptyState.tsx
// Branded "nothing here yet" block — consistent empty state across lists.
import type { ReactNode } from "react";

export function EmptyState({
  icon,
  title,
  message,
  action,
}: {
  icon?: ReactNode;
  title: string;
  message?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-14 px-6 border border-zinc-800/80 bg-zinc-950/40 clip-corner">
      <div className="w-16 h-16 mb-4 flex items-center justify-center rounded-full border border-red-900/50 bg-red-950/20 text-red-500/80">
        {icon ?? <span className="text-3xl">👻</span>}
      </div>
      <h3 className="text-zinc-200 font-bold text-base tracking-wide mb-1.5">{title}</h3>
      {message && (
        <p className="text-zinc-500 text-xs sm:text-sm max-w-sm leading-relaxed">{message}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
