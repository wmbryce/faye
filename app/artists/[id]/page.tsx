import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { currentUser } from "@/lib/auth/current-user";
import { Shell } from "@/components/layout/shell";
import { PageHeader } from "@/components/layout/page-header";
import { getArtist } from "@/lib/artists/queries";
import { listAssets } from "@/lib/assets/queries";
import { listReleases } from "@/lib/releases/queries";
import { listAudienceSeeds } from "@/lib/audiences/queries";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default async function ArtistDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const { id } = await params;
  const artist = await getArtist(id);
  if (!artist) notFound();

  const [assets, releases, seeds] = await Promise.all([
    listAssets(id),
    listReleases(id),
    listAudienceSeeds(id),
  ]);

  return (
    <Shell email={user.email}>
      <PageHeader
        eyebrow={<span className="font-mono">{artist.spotifyArtistId}</span>}
        title={artist.name}
        description={artist.timezone}
        actions={
          <div className="flex items-center gap-2">
            <Link href={`/artists/${artist.id}/campaigns/new`}>
              <Button size="sm">New campaign</Button>
            </Link>
            <Link href={`/artists/${artist.id}/edit`}>
              <Button variant="outline" size="sm">Edit</Button>
            </Link>
          </div>
        }
      />

      <div className="mt-8 grid lg:grid-cols-3 gap-4">
        <ResourceCard
          href={`/artists/${artist.id}/assets`}
          label="Assets"
          count={assets.length}
          description="Images and short videos Faye picks from for ad creative."
        />
        <ResourceCard
          href={`/artists/${artist.id}/releases`}
          label="Releases"
          count={releases.length}
          description="Tracks or albums. Each release gets its own campaign window."
        />
        <ResourceCard
          href={`/artists/${artist.id}/audiences`}
          label="Audience seeds"
          count={seeds.length}
          description="Reusable FB targeting specs picked at campaign create (max 5 per campaign)."
        />
      </div>

      <section className="mt-10">
        <h2 className="label mb-3">Voice guide</h2>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm whitespace-pre-wrap leading-relaxed">
              {artist.voiceGuide || <span className="text-muted-foreground">(no voice guide yet — Faye will generate generically)</span>}
            </p>
          </CardContent>
        </Card>
      </section>

      <section className="mt-8">
        <h2 className="label mb-3">Metadata</h2>
        <Card>
          <CardContent className="p-5">
            <dl className="grid grid-cols-[10rem_1fr] gap-y-2 text-sm">
              <dt className="label">Spotify ID</dt>
              <dd className="num">{artist.spotifyArtistId}</dd>
              <dt className="label">Timezone</dt>
              <dd className="num">{artist.timezone}</dd>
              <dt className="label">FB page</dt>
              <dd className="num">{artist.fbPageId ?? "—"}</dd>
              <dt className="label">S4A token</dt>
              <dd className="num">{artist.spotifyForArtistsToken ? "linked" : "—"}</dd>
            </dl>
          </CardContent>
        </Card>
      </section>
    </Shell>
  );
}

function ResourceCard({ href, label, count, description }: { href: string; label: string; count: number; description: string }) {
  return (
    <Link href={href} className="group block">
      <Card className="transition-colors group-hover:bg-surface-2/40 group-hover:border-border h-full">
        <CardContent className="p-5">
          <div className="flex items-baseline justify-between">
            <div className="label">{label}</div>
            <span className="text-muted-foreground group-hover:text-accent transition-colors">→</span>
          </div>
          <div className="mt-3 font-mono text-3xl tabular-nums tracking-tight">{count}</div>
          <p className="mt-3 text-sm text-muted-foreground">{description}</p>
        </CardContent>
      </Card>
    </Link>
  );
}
