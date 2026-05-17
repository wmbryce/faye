"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { Asset, Audience } from "@/lib/db/schema";

export function AdForm({
  audiences,
  assets,
  action,
}: {
  audiences: Audience[];
  assets: Asset[];
  action: (fd: FormData) => Promise<void>;
}) {
  const [assetId, setAssetId] = useState<string>(assets[0]?.id ?? "");

  if (audiences.length === 0) {
    return (
      <div className="rounded-lg border border-border-subtle bg-surface-1 p-5 text-sm text-muted-foreground">
        Campaign has no audiences. This shouldn&apos;t happen for an activated campaign.
      </div>
    );
  }
  if (assets.length === 0) {
    return (
      <div className="rounded-lg border border-border-subtle bg-surface-1 p-5 text-sm text-muted-foreground">
        The artist has no assets. Upload an image or video first.
      </div>
    );
  }

  return (
    <form action={action} className="space-y-6 max-w-3xl">
      <Field label="Audience" htmlFor="audienceId">
        <select
          id="audienceId"
          name="audienceId"
          required
          defaultValue={audiences[0].id}
          className="flex h-9 w-full rounded-md border border-border bg-surface-1 px-3 text-sm text-foreground focus-visible:outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          {audiences.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
      </Field>

      <div className="space-y-2">
        <span className="text-xs uppercase tracking-[0.08em] font-medium text-muted-foreground">Asset</span>
        <input type="hidden" name="assetId" value={assetId} required />
        <ul className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-3">
          {assets.map((a) => {
            const selected = a.id === assetId;
            return (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => setAssetId(a.id)}
                  className={`group block w-full overflow-hidden rounded-lg border bg-surface-1 transition-colors text-left ${
                    selected
                      ? "border-accent ring-2 ring-accent/40"
                      : "border-border-subtle hover:border-border"
                  }`}
                >
                  <div className="aspect-[4/5] overflow-hidden">
                    {a.kind === "image" ? (
                      <img src={a.url} alt={a.label || "asset"} className="h-full w-full object-cover" />
                    ) : (
                      <video src={a.url} className="h-full w-full object-cover" muted />
                    )}
                  </div>
                  <div className="px-2 py-1.5 text-xs truncate">
                    {a.label || <span className="text-muted-foreground italic">unlabeled</span>}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <Field label="Headline" htmlFor="copyHeadline" hint="Max 40 chars.">
        <Input id="copyHeadline" name="copyHeadline" required maxLength={40} />
      </Field>
      <Field label="Primary text" htmlFor="copyPrimaryText" hint="Max 125 chars. Shown above the asset on FB feed.">
        <Textarea id="copyPrimaryText" name="copyPrimaryText" required maxLength={125} rows={3} />
      </Field>
      <Field label="Body" htmlFor="copyBody" hint="Optional. Smaller description line under the asset.">
        <Input id="copyBody" name="copyBody" />
      </Field>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="submit" name="_action" value="save" variant="outline">Save draft</Button>
        <Button type="submit" name="_action" value="publish">Publish now</Button>
      </div>
    </form>
  );
}
