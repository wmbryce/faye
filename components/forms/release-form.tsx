import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

export function ReleaseForm({ action }: { action: (fd: FormData) => Promise<void> }) {
  return (
    <form action={action} className="space-y-5 max-w-lg">
      <Field label="Kind" htmlFor="kind">
        <select
          id="kind"
          name="kind"
          className="flex h-9 w-full rounded-md border border-border bg-surface-1 px-3 text-sm text-foreground focus-visible:outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <option value="track">Track</option>
          <option value="album">Album</option>
        </select>
      </Field>
      <Field label="Title" htmlFor="title">
        <Input id="title" name="title" required />
      </Field>
      <Field label="Spotify ID" htmlFor="spotifyId" hint="Track or album ID (22 chars).">
        <Input id="spotifyId" name="spotifyId" required />
      </Field>
      <Field label="Release date" htmlFor="releaseDate">
        <Input id="releaseDate" name="releaseDate" type="date" required />
      </Field>
      <div className="flex justify-end pt-2">
        <Button type="submit">Create release</Button>
      </div>
    </form>
  );
}
