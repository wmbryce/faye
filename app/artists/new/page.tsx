import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/current-user";
import { Nav } from "@/components/layout/nav";
import { ArtistForm } from "@/components/forms/artist-form";
import { createArtistAction } from "../actions";

export default async function NewArtistPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  return (
    <>
      <Nav email={user.email} />
      <main className="max-w-5xl mx-auto px-6 py-10">
        <h1 className="text-2xl font-semibold mb-6">New artist</h1>
        <ArtistForm action={createArtistAction} submitLabel="Create artist" />
      </main>
    </>
  );
}
