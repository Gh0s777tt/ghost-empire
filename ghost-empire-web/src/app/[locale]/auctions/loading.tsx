// Route-level skeleton (#783/A5): auction cards while the board loads.
import { PageSkeleton } from "@/components/Skeleton";

export default function Loading() {
  return <PageSkeleton cards={4} cols="grid-cols-1" />;
}
