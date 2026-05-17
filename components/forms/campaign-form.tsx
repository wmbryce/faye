import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import type { Release, AudienceSeed } from "@/lib/db/schema";

export function CampaignForm({
  artistId,
  releases,
  seeds,
  action,
}: {
  artistId: string;
  releases: Release[];
  seeds: AudienceSeed[];
  action: (fd: FormData) => Promise<void>;
}) {
  if (releases.length === 0) {
    return (
      <div className="rounded-lg border border-border-subtle bg-surface-1 p-5 text-sm text-muted-foreground">
        This artist has no releases yet. Add a release first before creating a campaign.
      </div>
    );
  }
  if (seeds.length === 0) {
    return (
      <div className="rounded-lg border border-border-subtle bg-surface-1 p-5 text-sm text-muted-foreground">
        This artist has no audience seeds yet. Add at least one before creating a campaign.
      </div>
    );
  }

  const firstRelease = releases[0];
  const defaultSpotifyUrl = `https://open.spotify.com/${firstRelease.kind}/${firstRelease.spotifyId}`;

  return (
    <form action={action} className="space-y-5 max-w-xl">
      <Field label="Release" htmlFor="releaseId" hint="Track or album this campaign promotes.">
        <select
          id="releaseId"
          name="releaseId"
          required
          defaultValue={firstRelease.id}
          className="flex h-9 w-full rounded-md border border-border bg-surface-1 px-3 text-sm text-foreground focus-visible:outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          {releases.map((r) => (
            <option key={r.id} value={r.id}>
              {r.title} · {r.kind} · {r.releaseDate}
            </option>
          ))}
        </select>
      </Field>

      <Field
        label="Spotify URL"
        htmlFor="spotifyTrackOrAlbumUrl"
        hint="Where the smartlink redirects on the Spotify tap."
      >
        <Input
          id="spotifyTrackOrAlbumUrl"
          name="spotifyTrackOrAlbumUrl"
          type="url"
          required
          defaultValue={defaultSpotifyUrl}
        />
      </Field>

      <div className="grid grid-cols-3 gap-3">
        <Field label="Daily budget (USD)" htmlFor="dailyBudgetDollars">
          <Input
            id="dailyBudgetDollars"
            name="dailyBudgetDollars"
            type="number"
            required
            min="1"
            step="0.01"
            defaultValue="10"
          />
        </Field>
        <Field label="Start date" htmlFor="startDate">
          <Input id="startDate" name="startDate" type="date" required />
        </Field>
        <Field label="End date" htmlFor="endDate">
          <Input id="endDate" name="endDate" type="date" required />
        </Field>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-xs uppercase tracking-[0.08em] font-medium text-muted-foreground mb-2">
          Audience seeds (1–5)
        </legend>
        <div className="space-y-2 border border-border-subtle rounded-md p-3 bg-surface-1">
          {seeds.map((s) => (
            <label key={s.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="audienceSeedIds"
                value={s.id}
                className="h-4 w-4 accent-[hsl(var(--accent))]"
              />
              <span className="font-medium">{s.name}</span>
              <span className="text-muted-foreground font-mono text-xs ml-auto truncate">
                {Object.keys(s.targetingSpec as Record<string, unknown>).join(", ")}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex justify-end pt-2">
        <Button type="submit">Create campaign</Button>
      </div>

      <input type="hidden" name="_artistId" value={artistId} />
    </form>
  );
}
