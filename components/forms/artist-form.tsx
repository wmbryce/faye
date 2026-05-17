import { Button } from "@/components/ui/button";
import type { Artist } from "@/lib/db/schema";

export function ArtistForm({ initial, action, submitLabel }: {
  initial?: Partial<Artist>;
  action: (fd: FormData) => Promise<void>;
  submitLabel: string;
}) {
  return (
    <form action={action} className="space-y-4 max-w-md">
      <Field name="name" label="Artist name" required defaultValue={initial?.name ?? ""} />
      {!initial?.spotifyArtistId ? (
        <Field name="spotifyArtistId" label="Spotify artist ID" required />
      ) : (
        <input type="hidden" name="spotifyArtistId" value={initial.spotifyArtistId} />
      )}
      <Field name="timezone" label="Timezone (IANA)" defaultValue={initial?.timezone ?? "America/Denver"} required />
      <Field name="fbPageId" label="Facebook Page ID (optional)" defaultValue={initial?.fbPageId ?? ""} />
      <TextArea name="voiceGuide" label="Voice guide" defaultValue={initial?.voiceGuide ?? ""} rows={6} />
      <Button type="submit">{submitLabel}</Button>
    </form>
  );
}

function Field({ name, label, defaultValue, required, type }: { name: string; label: string; defaultValue?: string; required?: boolean; type?: string }) {
  return (
    <label className="block">
      <span className="text-sm">{label}</span>
      <input
        name={name}
        type={type ?? "text"}
        defaultValue={defaultValue ?? ""}
        required={required}
        className="mt-1 w-full h-9 px-3 border border-border rounded-md bg-background"
      />
    </label>
  );
}

function TextArea({ name, label, defaultValue, rows }: { name: string; label: string; defaultValue?: string; rows?: number }) {
  return (
    <label className="block">
      <span className="text-sm">{label}</span>
      <textarea
        name={name}
        defaultValue={defaultValue ?? ""}
        rows={rows ?? 4}
        className="mt-1 w-full px-3 py-2 border border-border rounded-md bg-background"
      />
    </label>
  );
}
