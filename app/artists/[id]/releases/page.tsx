import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { currentUser } from "@/lib/auth/current-user";
import { Nav } from "@/components/layout/nav";
import { getArtist } from "@/lib/artists/queries";
import { listReleases } from "@/lib/releases/queries";
import { Button } from "@/components/ui/button";

export default async function ReleasesPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const { id } = await params;
  const artist = await getArtist(id);
  if (!artist) notFound();
  const rows = await listReleases(id);
  return (
    <>
      <Nav email={user.email} />
      <main className="max-w-5xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-semibold">{artist.name} — releases</h1>
          <Link href={`/artists/${id}/releases/new`}><Button>New release</Button></Link>
        </div>
        {rows.length === 0 ? (
          <p className="text-muted-foreground">No releases yet.</p>
        ) : (
          <ul className="divide-y divide-border border border-border rounded-md">
            {rows.map((r) => (
              <li key={r.id} className="p-4">
                <span className="font-medium">{r.title}</span>
                <span className="ml-3 text-sm text-muted-foreground">{r.kind} · {r.releaseDate}</span>
                <span className="ml-3 text-xs text-muted-foreground">{r.spotifyId}</span>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
