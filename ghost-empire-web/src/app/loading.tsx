// src/app/loading.tsx
// Global route-transition fallback. Next.js shows this instantly (streamed before
// the server component resolves) on navigation to any segment without its own
// loading.tsx — turning a blank wait into immediate branded feedback.
import { Ghost } from "lucide-react";

export default function Loading() {
  return (
    <div className="min-h-screen bg-black flex items-center justify-center px-4">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[500px] h-[500px] rounded-full blur-[150px] opacity-10"
          style={{ background: "radial-gradient(circle, #E50914 0%, transparent 70%)" }}
        />
      </div>

      <div className="relative z-10 flex flex-col items-center gap-5">
        <div className="relative">
          {/* Pulsing glow ring */}
          <div
            className="absolute inset-0 rounded-full blur-xl animate-ping opacity-40"
            style={{ background: "#E50914" }}
          />
          <div
            className="relative w-16 h-16 flex items-center justify-center animate-pulse"
            style={{
              background: "linear-gradient(135deg, #E50914 0%, #8B0000 100%)",
              clipPath: "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)",
            }}
          >
            <Ghost className="w-8 h-8 text-white" strokeWidth={2} />
          </div>
        </div>
        <p className="font-display text-sm text-zinc-500 tracking-[0.3em] uppercase animate-pulse">
          Ładowanie
        </p>
      </div>
    </div>
  );
}
