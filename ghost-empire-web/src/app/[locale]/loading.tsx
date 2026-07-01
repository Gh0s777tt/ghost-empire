// src/app/loading.tsx
// Global route-transition fallback. Next.js shows this instantly (streamed before
// the server component resolves) on navigation to any segment without its own
// loading.tsx — turning a blank wait into immediate branded feedback.
export default function Loading() {
  return (
    <div className="min-h-screen bg-black flex items-center justify-center px-4">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[500px] h-[500px] rounded-full blur-[150px] opacity-10"
          style={{ background: "radial-gradient(circle, var(--brand) 0%, transparent 70%)" }}
        />
      </div>

      <div className="relative z-10 flex flex-col items-center gap-5">
        <div className="relative">
          {/* Pulsing glow ring */}
          <div
            className="absolute inset-0 rounded-full blur-xl animate-ping opacity-40"
            style={{ background: "var(--brand)" }}
          />
          <div className="relative w-16 h-16 overflow-hidden rounded-2xl ring-2 ring-red-600/40 animate-pulse">
            <img src="/brand/skull.png" alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" />
          </div>
        </div>
        {/* Language-neutral pulsing dots — this is a Suspense fallback (no locale
            context available), so an animated indicator avoids a single-language
            word flashing for all 14 locales. */}
        <div className="flex items-center gap-2" role="status" aria-label="Loading">
          <span className="w-2 h-2 rounded-full bg-red-600/70 animate-pulse" />
          <span className="w-2 h-2 rounded-full bg-red-600/70 animate-pulse [animation-delay:0.15s]" />
          <span className="w-2 h-2 rounded-full bg-red-600/70 animate-pulse [animation-delay:0.3s]" />
        </div>
      </div>
    </div>
  );
}
