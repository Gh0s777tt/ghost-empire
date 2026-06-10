// src/components/Skeleton.tsx
// Loading-skeleton primitives for route-level loading.tsx files. Pure server
// components (no JS shipped): pulsing blocks in the page's dark palette, so
// navigation shows the page's silhouette instead of a blank screen.
export function Skel({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse bg-zinc-900 rounded ${className}`} aria-hidden />;
}

/** Standard page scaffold: header + a grid of pulsing cards. */
export function PageSkeleton({ cards = 6, cols = "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3" }: { cards?: number; cols?: string }) {
  return (
    <div className="min-h-screen bg-black">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-24 space-y-6">
        <div className="space-y-2">
          <Skel className="h-9 w-56" />
          <Skel className="h-4 w-80 max-w-full" />
        </div>
        <div className={`grid gap-4 ${cols}`}>
          {Array.from({ length: cards }, (_, i) => (
            <div key={i} className="border border-zinc-900 bg-zinc-950/60 p-4 space-y-3">
              <Skel className="h-5 w-2/3" />
              <Skel className="h-4 w-full" />
              <Skel className="h-4 w-1/2" />
              <Skel className="h-8 w-28" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
