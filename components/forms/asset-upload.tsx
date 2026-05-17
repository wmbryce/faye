"use client";
import { useTransition } from "react";
import { uploadAssetAction } from "@/app/artists/[id]/assets/actions";
import { Button } from "@/components/ui/button";

export function AssetUpload({ artistId }: { artistId: string }) {
  const [pending, start] = useTransition();
  return (
    <form
      action={(fd) => start(() => uploadAssetAction(artistId, fd))}
      className="flex items-end gap-3 mb-6"
    >
      <label className="block">
        <span className="text-sm">File</span>
        <input name="file" type="file" required accept="image/*,video/*" className="block mt-1" />
      </label>
      <label className="block">
        <span className="text-sm">Label</span>
        <input name="label" className="block mt-1 h-9 px-3 border border-border rounded-md bg-background" />
      </label>
      <Button type="submit" disabled={pending}>{pending ? "Uploading…" : "Upload"}</Button>
    </form>
  );
}
