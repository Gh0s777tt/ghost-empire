// Route-level skeleton: event cards while events load.
import { PageSkeleton } from "@/components/Skeleton";

export default function Loading() {
  return <PageSkeleton cards={4} cols="grid-cols-1 md:grid-cols-2" />;
}
