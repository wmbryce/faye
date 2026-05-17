import { redirect, notFound } from "next/navigation";
import { currentUser } from "@/lib/auth/current-user";
import { Shell } from "@/components/layout/shell";
import { PageHeader } from "@/components/layout/page-header";
import { getCampaign, listAudiencesForCampaign } from "@/lib/campaigns/queries";
import { getArtist } from "@/lib/artists/queries";
import { getRelease } from "@/lib/releases/queries";
import { listAssets } from "@/lib/assets/queries";
import { AdForm } from "@/components/forms/ad-form";
import { createAdAction } from "../actions";

export default async function NewAdPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const { id } = await params;
  const campaign = await getCampaign(id);
  if (!campaign) notFound();
  const [artist, release, audiences, assets] = await Promise.all([
    getArtist(campaign.artistId),
    getRelease(campaign.releaseId),
    listAudiencesForCampaign(campaign.id),
    listAssets(campaign.artistId),
  ]);
  return (
    <Shell email={user.email}>
      <PageHeader
        eyebrow={`${artist?.name} — ${release?.title}`}
        title="New ad"
        description="Hand-write the ad and pick an asset. Faye's autonomous loop generates new variants in Phase 6."
      />
      <div className="mt-8">
        <AdForm audiences={audiences} assets={assets} action={createAdAction.bind(null, id)} />
      </div>
    </Shell>
  );
}
