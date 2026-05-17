import { redirect, notFound } from "next/navigation";
import { currentUser } from "@/lib/auth/current-user";
import { Nav } from "@/components/layout/nav";
import { getArtist } from "@/lib/artists/queries";
import { ReleaseForm } from "@/components/forms/release-form";
import { createReleaseAction } from "../actions";

export default async function NewReleasePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const { id } = await params;
  const artist = await getArtist(id);
  if (!artist) notFound();
  return (
    <>
      <Nav email={user.email} />
      <main className="max-w-5xl mx-auto px-6 py-10">
        <h1 className="text-2xl font-semibold mb-6">New release · {artist.name}</h1>
        <ReleaseForm action={createReleaseAction.bind(null, id)} />
      </main>
    </>
  );
}
