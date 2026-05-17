import { Button } from "@/components/ui/button";

export function ReleaseForm({ action }: { action: (fd: FormData) => Promise<void> }) {
  return (
    <form action={action} className="space-y-4 max-w-md">
      <label className="block">
        <span className="text-sm">Kind</span>
        <select name="kind" className="mt-1 w-full h-9 px-3 border border-border rounded-md bg-background">
          <option value="track">Track</option>
          <option value="album">Album</option>
        </select>
      </label>
      <Field name="title" label="Title" required />
      <Field name="spotifyId" label="Spotify ID" required />
      <Field name="releaseDate" label="Release date" type="date" required />
      <Button type="submit">Create release</Button>
    </form>
  );
}

function Field({ name, label, type, required }: { name: string; label: string; type?: string; required?: boolean }) {
  return (
    <label className="block">
      <span className="text-sm">{label}</span>
      <input
        name={name}
        type={type ?? "text"}
        required={required}
        className="mt-1 w-full h-9 px-3 border border-border rounded-md bg-background"
      />
    </label>
  );
}
