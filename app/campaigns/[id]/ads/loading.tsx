import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <main className="max-w-6xl mx-auto px-6 lg:px-8 py-10 space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-8 w-40" />
      </div>
      <Skeleton className="h-96 w-full" />
    </main>
  );
}
