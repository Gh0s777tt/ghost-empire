// Route-level skeleton: the casino's silhouette (title, stage, controls).
import { Skel } from "@/components/Skeleton";

export default function Loading() {
  return (
    <div className="min-h-screen bg-black">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-24 flex flex-col items-center gap-6">
        <Skel className="h-9 w-48" />
        <Skel className="h-4 w-72 max-w-full" />
        <Skel className="h-[300px] w-[340px] max-w-full rounded-2xl" />
        <div className="flex gap-2">
          {Array.from({ length: 5 }, (_, i) => (
            <Skel key={i} className="h-9 w-16 rounded-full" />
          ))}
        </div>
        <div className="flex gap-3">
          <Skel className="h-12 w-28 rounded-full" />
          <Skel className="h-12 w-28 rounded-full" />
        </div>
      </div>
    </div>
  );
}
