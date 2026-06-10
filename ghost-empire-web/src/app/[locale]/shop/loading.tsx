// Route-level skeleton: the shop's silhouette while server data loads.
import { PageSkeleton } from "@/components/Skeleton";

export default function Loading() {
  return <PageSkeleton cards={6} />;
}
