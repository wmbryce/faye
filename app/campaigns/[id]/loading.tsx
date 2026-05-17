import { Skeleton } from "@/components/ui/skeleton";

// Note: this is a server component but Shell needs the email — render a minimal
// chrome-less skeleton instead so we don't have to read the cookie here.
export default function Loading() {
  return (
    <main className="max-w-6xl mx-auto px-6 lg:px-8 py-10 space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-8 w-96" />
      </div>
      <div className="grid sm:grid-cols-3 gap-4">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
      <Skeleton className="h-80 w-full" />
    </main>
  );
}
