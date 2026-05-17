import { redirect, notFound } from "next/navigation";
import { currentUser } from "@/lib/auth/current-user";
import { Shell } from "@/components/layout/shell";
import { PageHeader } from "@/components/layout/page-header";
import { getArtist } from "@/lib/artists/queries";
import { listReleases } from "@/lib/releases/queries";
import { listAudienceSeeds } from "@/lib/audiences/queries";
import { CampaignForm } from "@/components/forms/campaign-form";
import { createCampaignAction } from "../actions";

export default async function NewCampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const { id } = await params;
  const artist = await getArtist(id);
  if (!artist) notFound();
  const [releases, seeds] = await Promise.all([listReleases(id), listAudienceSeeds(id)]);
  return (
    <Shell email={user.email}>
      <PageHeader
        eyebrow={artist.name}
        title="New campaign"
        description="Faye creates a Facebook campaign, smartlink, and one ad set per audience seed at submit. Hand-written ads come next."
      />
      <div className="mt-8">
        <CampaignForm
          artistId={id}
          releases={releases}
          seeds={seeds}
          action={createCampaignAction.bind(null, id)}
        />
      </div>
    </Shell>
  );
}
