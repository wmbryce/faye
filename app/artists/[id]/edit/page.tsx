import { redirect, notFound } from "next/navigation";
import { currentUser } from "@/lib/auth/current-user";
import { Shell } from "@/components/layout/shell";
import { PageHeader } from "@/components/layout/page-header";
import { getArtist } from "@/lib/artists/queries";
import { ArtistForm } from "@/components/forms/artist-form";
import { updateArtistAction } from "../../actions";

export default async function EditArtistPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const { id } = await params;
  const artist = await getArtist(id);
  if (!artist) notFound();
  return (
    <Shell email={user.email}>
      <PageHeader
        eyebrow={<span className="font-mono">{artist.spotifyArtistId}</span>}
        title={`Edit · ${artist.name}`}
      />
      <div className="mt-8">
        <ArtistForm
          initial={artist}
          action={updateArtistAction.bind(null, artist.id)}
          submitLabel="Save"
        />
      </div>
    </Shell>
  );
}
