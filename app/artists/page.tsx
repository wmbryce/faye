import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/current-user";
import { Shell } from "@/components/layout/shell";
import { PageHeader } from "@/components/layout/page-header";
import { listArtists } from "@/lib/artists/queries";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

export default async function ArtistsPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  const rows = await listArtists();

  return (
    <Shell email={user.email}>
      <PageHeader
        eyebrow="Roster"
        title="Artists"
        description="Each artist gets its own asset pool, releases, and audience seeds. Campaigns sit on top of these."
        actions={
          <Link href="/artists/new">
            <Button>+ New artist</Button>
          </Link>
        }
      />

      {rows.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            title="No artists yet"
            description="Add an artist to start collecting assets, releases, and audience seeds for Faye to use."
            action={
              <Link href="/artists/new">
                <Button>+ New artist</Button>
              </Link>
            }
          />
        </div>
      ) : (
        <ul className="mt-8 grid sm:grid-cols-2 gap-4">
          {rows.map((a) => (
            <li key={a.id}>
              <Link href={`/artists/${a.id}`} className="block group">
                <Card className="transition-colors group-hover:bg-surface-2/40 group-hover:border-border">
                  <CardContent className="p-5 flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="font-medium tracking-tight truncate">{a.name}</div>
                      <div className="mt-1 text-xs font-mono text-muted-foreground truncate">
                        {a.spotifyArtistId}
                      </div>
                      <div className="mt-2 text-xs text-muted-foreground">
                        {a.timezone}
                      </div>
                    </div>
                    <span className="text-muted-foreground group-hover:text-accent transition-colors">→</span>
                  </CardContent>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Shell>
  );
}
