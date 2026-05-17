import type { Ad } from "@/lib/db/schema";
import { Badge, statusVariant } from "@/components/ui/badge";

export function AdCard({ ad }: { ad: Ad }) {
  return (
    <li className="rounded-md border border-border-subtle bg-surface-1 p-4 text-sm">
      <div className="flex items-center justify-between gap-3 mb-2">
        <span className="font-medium truncate">{ad.copyHeadline}</span>
        <span className="shrink-0 flex items-center gap-2">
          <span className="font-mono text-xs text-muted-foreground">gen{ad.generation}</span>
          <Badge variant={statusVariant(ad.status)}>{ad.status}</Badge>
        </span>
      </div>
      <p className="text-muted-foreground line-clamp-2">{ad.copyPrimaryText}</p>
      {ad.fbAdId && (
        <p className="font-mono text-xs text-muted-foreground mt-2 truncate">{ad.fbAdId}</p>
      )}
    </li>
  );
}
