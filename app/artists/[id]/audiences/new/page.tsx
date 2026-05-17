import { redirect, notFound } from "next/navigation";
import { currentUser } from "@/lib/auth/current-user";
import { Shell } from "@/components/layout/shell";
import { PageHeader } from "@/components/layout/page-header";
import { getArtist } from "@/lib/artists/queries";
import { AudienceSeedForm } from "@/components/forms/audience-seed-form";
import { createSeedAction } from "../actions";

export default async function NewSeedPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const { id } = await params;
  const artist = await getArtist(id);
  if (!artist) notFound();
  return (
    <Shell email={user.email}>
      <PageHeader eyebrow={artist.name} title="New audience seed" />
      <div className="mt-8">
        <AudienceSeedForm action={createSeedAction.bind(null, id)} />
      </div>
    </Shell>
  );
}
