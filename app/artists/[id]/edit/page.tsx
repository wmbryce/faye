import { redirect, notFound } from "next/navigation";
import { currentUser } from "@/lib/auth/current-user";
import { Nav } from "@/components/layout/nav";
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
    <>
      <Nav email={user.email} />
      <main className="max-w-5xl mx-auto px-6 py-10">
        <h1 className="text-2xl font-semibold mb-6">Edit {artist.name}</h1>
        <ArtistForm
          initial={artist}
          action={updateArtistAction.bind(null, artist.id)}
          submitLabel="Save"
        />
      </main>
    </>
  );
}
