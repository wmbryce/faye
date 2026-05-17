import type { Asset } from "@/lib/db/schema";
import { EmptyState } from "@/components/ui/empty-state";

export function AssetGrid({ assets }: { assets: Asset[] }) {
  if (assets.length === 0) {
    return (
      <EmptyState
        title="No assets yet"
        description="Upload an image or short video above. Square or 4:5 aspect ratios work best for FB feed placements."
      />
    );
  }
  return (
    <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      {assets.map((a) => (
        <li
          key={a.id}
          className="group overflow-hidden rounded-lg border border-border-subtle bg-surface-1 transition-colors hover:border-border"
        >
          <div className="aspect-[4/5] overflow-hidden">
            {a.kind === "image" ? (
              <img
                src={a.url}
                alt={a.label || "asset"}
                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
              />
            ) : (
              <video
                src={a.url}
                controls
                className="h-full w-full object-cover"
              />
            )}
          </div>
          <div className="px-3 py-2 flex items-center justify-between text-xs">
            <span className="truncate text-foreground/90">
              {a.label || <span className="text-muted-foreground italic">unlabeled</span>}
            </span>
            <span className="ml-2 shrink-0 font-mono uppercase tracking-wider text-[10px] text-muted-foreground">{a.kind}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}
