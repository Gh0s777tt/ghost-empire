// Route-level skeleton: ranking rows while the leaderboard loads.
import { Skel } from "@/components/Skeleton";

export default function Loading() {
  return (
    <div className="min-h-screen bg-black">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-24 space-y-6">
        <div className="space-y-2">
          <Skel className="h-9 w-56" />
          <Skel className="h-4 w-80 max-w-full" />
        </div>
        <div className="flex gap-2">
          {Array.from({ length: 4 }, (_, i) => (
            <Skel key={i} className="h-9 w-24" />
          ))}
        </div>
        <div className="space-y-2">
          {Array.from({ length: 10 }, (_, i) => (
            <Skel key={i} className="h-12 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
