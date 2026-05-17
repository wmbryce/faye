import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/current-user";
import { Nav } from "@/components/layout/nav";
import { listArtists } from "@/lib/artists/queries";
import { Button } from "@/components/ui/button";

export default async function ArtistsPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  const rows = await listArtists();
  return (
    <>
      <Nav email={user.email} />
      <main className="max-w-5xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-semibold">Artists</h1>
          <Link href="/artists/new"><Button>New artist</Button></Link>
        </div>
        {rows.length === 0 ? (
          <p className="text-muted-foreground">No artists yet.</p>
        ) : (
          <ul className="divide-y divide-border border border-border rounded-md">
            {rows.map((a) => (
              <li key={a.id} className="p-4 hover:bg-muted">
                <Link href={`/artists/${a.id}`} className="font-medium">{a.name}</Link>
                <span className="ml-3 text-sm text-muted-foreground">{a.spotifyArtistId}</span>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
