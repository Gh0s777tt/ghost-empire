// Route-level skeleton (#783/A5): league standings while they load.
import { PageSkeleton } from "@/components/Skeleton";

export default function Loading() {
  return <PageSkeleton cards={5} cols="grid-cols-1" />;
}
