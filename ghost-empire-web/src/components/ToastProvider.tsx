"use client";
// src/components/ToastProvider.tsx
// Single shared toast system (#598). Replaces the per-component ad-hoc
// `useState<{kind,msg}>` + setTimeout + fixed-position <div> feedback that the
// floating-toast components (Shop / Admin / Predictions / Polls / Events /
// Seasons / Market / Collectibles) each re-implemented slightly differently.
// Mounted once in Providers; call `useToast()` anywhere beneath it. Messages are
// pre-localized by callers (next-intl), so this provider stays i18n-agnostic.
import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type ToastKind = "ok" | "err";

interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

export interface ToastApi {
  /** Show a toast. `ok` = success (emerald), `err` = error (red). */
  show: (kind: ToastKind, message: string) => void;
  ok: (message: string) => void;
  err: (message: string) => void;
}

const ToastCtx = createContext<ToastApi | null>(null);

// How long a toast stays before auto-dismiss, and how many stack at once.
const DISMISS_MS = 3600;
const MAX_VISIBLE = 3;

export function useToast(): ToastApi {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error("useToast must be used within <ToastProvider>");
  return ctx;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(0);
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: number) => {
    setToasts((cur) => cur.filter((t) => t.id !== id));
    const h = timers.current.get(id);
    if (h) {
      clearTimeout(h);
      timers.current.delete(id);
    }
  }, []);

  const show = useCallback(
    (kind: ToastKind, message: string) => {
      if (!message) return;
      const id = (idRef.current += 1);
      // Cap the stack so a burst can't fill the screen (drops the oldest).
      setToasts((cur) => [...cur, { id, kind, message }].slice(-MAX_VISIBLE));
      const h = setTimeout(() => dismiss(id), DISMISS_MS);
      timers.current.set(id, h);
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({ show, ok: (m: string) => show("ok", m), err: (m: string) => show("err", m) }),
    [show],
  );

  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div className="fixed bottom-6 end-6 z-[100] flex flex-col gap-2 pointer-events-none" aria-live="polite">
        {toasts.map((t) => (
          <button
            type="button"
            key={t.id}
            onClick={() => dismiss(t.id)}
            role={t.kind === "ok" ? "status" : "alert"}
            aria-live={t.kind === "ok" ? "polite" : "assertive"}
            className={cn(
              "pointer-events-auto max-w-md w-full text-start border rounded-lg px-4 py-3 flex items-center gap-3 shadow-2xl animate-[getoastin_180ms_ease-out]",
              t.kind === "ok"
                ? "border-green-700 bg-green-950/90 text-green-200"
                : "border-red-700 bg-red-950/90 text-red-200",
            )}
          >
            {t.kind === "ok" ? <Check className="w-4 h-4 shrink-0" /> : <X className="w-4 h-4 shrink-0" />}
            <span className="text-sm">{t.message}</span>
          </button>
        ))}
        <style>{`@keyframes getoastin { from { opacity:0; transform: translateY(8px) } to { opacity:1; transform: translateY(0) } }`}</style>
      </div>
    </ToastCtx.Provider>
  );
}
