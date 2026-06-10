// Route-level skeleton: quest cards while tasks load.
import { PageSkeleton } from "@/components/Skeleton";

export default function Loading() {
  return <PageSkeleton cards={3} cols="grid-cols-1 md:grid-cols-3" />;
}
