"use client";
import { useRef, useTransition } from "react";
import { uploadAssetAction } from "@/app/artists/[id]/assets/actions";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

export function AssetUpload({ artistId }: { artistId: string }) {
  const [pending, start] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  return (
    <form
      ref={formRef}
      action={(fd) =>
        start(async () => {
          await uploadAssetAction(artistId, fd);
          formRef.current?.reset();
        })
      }
      className="flex flex-col sm:flex-row sm:items-end gap-3 mb-6 rounded-lg border border-border-subtle bg-surface-1/40 p-4"
    >
      <Field label="File" htmlFor="file" className="flex-1">
        <Input
          id="file"
          name="file"
          type="file"
          required
          accept="image/*,video/*"
          className="cursor-pointer file:mr-3 file:rounded file:border-0 file:bg-surface-2 file:px-3 file:py-1 file:text-foreground"
        />
      </Field>
      <Field label="Label" htmlFor="asset-label" className="flex-1">
        <Input id="asset-label" name="label" placeholder="optional" />
      </Field>
      <Button type="submit" disabled={pending}>
        {pending ? "Uploading…" : "Upload"}
      </Button>
    </form>
  );
}
