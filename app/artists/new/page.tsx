import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/current-user";
import { Shell } from "@/components/layout/shell";
import { PageHeader } from "@/components/layout/page-header";
import { ArtistForm } from "@/components/forms/artist-form";
import { createArtistAction } from "../actions";

export default async function NewArtistPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  return (
    <Shell email={user.email}>
      <PageHeader
        eyebrow="Roster"
        title="New artist"
        description="Spotify ID + timezone are required. Voice guide is optional but materially improves LLM-generated ad copy."
      />
      <div className="mt-8">
        <ArtistForm action={createArtistAction} submitLabel="Create artist" />
      </div>
    </Shell>
  );
}
