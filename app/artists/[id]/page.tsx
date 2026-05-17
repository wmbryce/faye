import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { currentUser } from "@/lib/auth/current-user";
import { Nav } from "@/components/layout/nav";
import { getArtist } from "@/lib/artists/queries";

export default async function ArtistDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const { id } = await params;
  const artist = await getArtist(id);
  if (!artist) notFound();
  return (
    <>
      <Nav email={user.email} />
      <main className="max-w-5xl mx-auto px-6 py-10 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">{artist.name}</h1>
          <Link href={`/artists/${artist.id}/edit`} className="text-sm underline">Edit</Link>
        </div>
        <dl className="grid grid-cols-2 gap-2 text-sm">
          <dt className="text-muted-foreground">Spotify ID</dt><dd>{artist.spotifyArtistId}</dd>
          <dt className="text-muted-foreground">Timezone</dt><dd>{artist.timezone}</dd>
          <dt className="text-muted-foreground">FB page</dt><dd>{artist.fbPageId ?? "—"}</dd>
        </dl>
        <p className="text-sm whitespace-pre-wrap">{artist.voiceGuide || "(no voice guide)"}</p>
        <nav className="flex gap-4 pt-6">
          <Link href={`/artists/${artist.id}/assets`} className="text-sm underline">Assets</Link>
          <Link href={`/artists/${artist.id}/releases`} className="text-sm underline">Releases</Link>
          <Link href={`/artists/${artist.id}/audiences`} className="text-sm underline">Audience seeds</Link>
        </nav>
      </main>
    </>
  );
}
