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

// Branded error block — for failed data loads, with an optional retry button.
// `title`/`retryLabel` are optional so callers can localize them (the Polish
// defaults are kept for existing call sites). #audit-UX
export function ErrorState({
  title = "Coś poszło nie tak",
  message,
  onRetry,
  retryLabel = "Spróbuj ponownie",
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
  retryLabel?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-12 px-6 border border-red-900/50 bg-red-950/20 clip-corner">
      <div className="w-16 h-16 mb-4 flex items-center justify-center rounded-full border border-red-700/60 bg-red-950/40 text-red-400">
        <span className="text-3xl">⚠️</span>
      </div>
      <h3 className="text-red-200 font-bold text-base tracking-wide mb-1.5">{title}</h3>
      {message && (
        <p className="text-red-300/70 text-xs sm:text-sm max-w-sm leading-relaxed">{message}</p>
      )}
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-5 px-4 py-2 bg-red-700 hover:bg-red-600 text-white text-[10px] font-bold tracking-widest uppercase transition-all inline-flex items-center gap-1.5"
        >
          <span aria-hidden>↻</span> {retryLabel}
        </button>
      )}
    </div>
  );
}
