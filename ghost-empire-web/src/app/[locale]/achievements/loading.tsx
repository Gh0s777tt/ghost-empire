// Route-level skeleton (#783/A5): achievement cards while the grid loads.
import { PageSkeleton } from "@/components/Skeleton";

export default function Loading() {
  return <PageSkeleton cards={9} cols="grid-cols-2 sm:grid-cols-3 lg:grid-cols-4" />;
}
