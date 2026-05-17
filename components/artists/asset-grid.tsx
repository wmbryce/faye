import type { Asset } from "@/lib/db/schema";

export function AssetGrid({ assets }: { assets: Asset[] }) {
  if (assets.length === 0) return <p className="text-muted-foreground">No assets yet.</p>;
  return (
    <ul className="grid grid-cols-3 gap-4">
      {assets.map((a) => (
        <li key={a.id} className="border border-border rounded-md p-2 text-sm">
          {a.kind === "image" ? (
            <img src={a.url} alt={a.label} className="aspect-square object-cover w-full rounded" />
          ) : (
            <video src={a.url} className="aspect-square object-cover w-full rounded" />
          )}
          <p className="mt-2">{a.label || <span className="text-muted-foreground">(no label)</span>}</p>
        </li>
      ))}
    </ul>
  );
}
