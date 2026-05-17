import { redirect, notFound } from "next/navigation";
import { currentUser } from "@/lib/auth/current-user";
import { Shell } from "@/components/layout/shell";
import { PageHeader } from "@/components/layout/page-header";
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
    <Shell email={user.email}>
      <PageHeader eyebrow={artist.name} title="New release" />
      <div className="mt-8">
        <ReleaseForm action={createReleaseAction.bind(null, id)} />
      </div>
    </Shell>
  );
}
