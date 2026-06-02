"use client";

// src/app/error.tsx
// Route-level error boundary. Catches runtime exceptions thrown while rendering
// any page/segment below the root layout and shows a friendly fallback instead
// of a white screen. `reset()` re-renders the segment (retry without full reload).
import { useEffect } from "react";
import Link from "next/link";
import { RotateCw, ArrowLeft } from "lucide-react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface in the browser console + Vercel logs for debugging.
    console.error("[app/error]", error);
  }, [error]);

  return (
    <div className="min-h-screen bg-black flex items-center justify-center px-4">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute top-1/4 left-1/4 w-[600px] h-[600px] rounded-full blur-[150px] opacity-15"
          style={{ background: "radial-gradient(circle, #E50914 0%, transparent 70%)" }}
        />
      </div>

      <div className="relative z-10 max-w-md w-full text-center">
        <div className="inline-flex items-center justify-center mb-6">
          <div className="w-20 h-20 overflow-hidden rounded-2xl ring-2 ring-red-600/40">
            <img src="/brand/skull.png" alt="" className="w-full h-full object-cover" />
          </div>
        </div>

        <h1
          className="font-display text-5xl text-white tracking-wider mb-2"
          style={{ textShadow: "3px 0 0 rgba(229,9,20,0.6), -3px 0 0 rgba(139,0,0,0.4)" }}
        >
          COŚ POSZŁO NIE TAK
        </h1>
        <p className="text-zinc-500 text-sm mb-8 max-w-sm mx-auto">
          Wystąpił nieoczekiwany błąd. Spróbuj ponownie — jeśli problem się
          powtarza, wróć na stronę główną i spróbuj za chwilę.
        </p>

        <div className="flex flex-col sm:flex-row gap-2 justify-center">
          <button
            onClick={() => reset()}
            className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-red-600 hover:bg-red-500 text-white font-bold text-xs tracking-widest uppercase transition-all"
          >
            <RotateCw className="w-4 h-4" />
            Spróbuj ponownie
          </button>
          <Link
            href="/"
            className="inline-flex items-center justify-center gap-2 px-6 py-3 border border-zinc-700 hover:border-zinc-500 text-zinc-300 font-bold text-xs tracking-widest uppercase transition-all"
          >
            <ArrowLeft className="w-4 h-4" />
            Strona główna
          </Link>
        </div>

        {error.digest && (
          <p className="text-zinc-700 text-[10px] font-mono uppercase tracking-widest mt-8">
            Error ID: {error.digest}
          </p>
        )}
      </div>
    </div>
  );
}
