import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { currentUser } from "@/lib/auth/current-user";
import { Shell } from "@/components/layout/shell";
import { PageHeader } from "@/components/layout/page-header";
import { getArtist } from "@/lib/artists/queries";
import { listReleases } from "@/lib/releases/queries";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

export default async function ReleasesPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const { id } = await params;
  const artist = await getArtist(id);
  if (!artist) notFound();
  const rows = await listReleases(id);
  return (
    <Shell email={user.email}>
      <PageHeader
        eyebrow={artist.name}
        title="Releases"
        description="Each release gets its own campaign window. Track or album."
        actions={
          <Link href={`/artists/${id}/releases/new`}>
            <Button>+ New release</Button>
          </Link>
        }
      />

      <div className="mt-8">
        {rows.length === 0 ? (
          <EmptyState
            title="No releases yet"
            description="Add a release to give Faye something concrete to promote."
            action={
              <Link href={`/artists/${id}/releases/new`}>
                <Button>+ New release</Button>
              </Link>
            }
          />
        ) : (
          <Card>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead className="text-muted-foreground">
                  <tr className="border-b border-border-subtle">
                    <th className="text-left font-medium px-5 py-3 label">Title</th>
                    <th className="text-left font-medium px-5 py-3 label">Kind</th>
                    <th className="text-left font-medium px-5 py-3 label">Released</th>
                    <th className="text-left font-medium px-5 py-3 label">Spotify ID</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b border-border-subtle last:border-0 hover:bg-surface-2/40 transition-colors">
                      <td className="px-5 py-3 font-medium">{r.title}</td>
                      <td className="px-5 py-3"><Badge variant="muted">{r.kind}</Badge></td>
                      <td className="px-5 py-3 num text-muted-foreground">{r.releaseDate}</td>
                      <td className="px-5 py-3 num text-xs text-muted-foreground">{r.spotifyId}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}
      </div>
    </Shell>
  );
}
