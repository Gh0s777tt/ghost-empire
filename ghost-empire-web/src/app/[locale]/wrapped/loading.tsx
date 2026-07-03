// Route-level skeleton (#783/A5): the Wrapped recap while it loads.
import { PageSkeleton } from "@/components/Skeleton";

export default function Loading() {
  return <PageSkeleton cards={4} cols="grid-cols-1 sm:grid-cols-2" />;
}
