import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { Artist } from "@/lib/db/schema";

export function ArtistForm({ initial, action, submitLabel }: {
  initial?: Partial<Artist>;
  action: (fd: FormData) => Promise<void>;
  submitLabel: string;
}) {
  return (
    <form action={action} className="space-y-5 max-w-lg">
      <Field label="Artist name" htmlFor="name">
        <Input id="name" name="name" required defaultValue={initial?.name ?? ""} placeholder="e.g. Hana Vu" />
      </Field>

      {!initial?.spotifyArtistId ? (
        <Field label="Spotify artist ID" htmlFor="spotifyArtistId" hint="The 22-char ID from the artist's Spotify URL.">
          <Input id="spotifyArtistId" name="spotifyArtistId" required placeholder="3UvqOgnGFxGB6Khzpkjsx7" />
        </Field>
      ) : (
        <input type="hidden" name="spotifyArtistId" value={initial.spotifyArtistId} />
      )}

      <Field label="Timezone (IANA)" htmlFor="timezone" hint="Used to schedule the daily 09:00 cron for this artist.">
        <Input id="timezone" name="timezone" required defaultValue={initial?.timezone ?? "America/Denver"} />
      </Field>

      <Field label="Facebook Page ID" htmlFor="fbPageId" hint="Optional. Used when Faye creates ads under your FB Page.">
        <Input id="fbPageId" name="fbPageId" defaultValue={initial?.fbPageId ?? ""} placeholder="11111111111111" />
      </Field>

      <Field label="Voice guide" htmlFor="voiceGuide" hint="Free-text. Fed to the LLM each generation as the cached artist-context block.">
        <Textarea id="voiceGuide" name="voiceGuide" defaultValue={initial?.voiceGuide ?? ""} rows={6} placeholder="warm + earnest indie folk; lyrical; references nature and small rooms; never use exclamation marks" />
      </Field>

      <div className="flex justify-end pt-2">
        <Button type="submit">{submitLabel}</Button>
      </div>
    </form>
  );
}
