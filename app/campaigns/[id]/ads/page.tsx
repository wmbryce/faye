import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { currentUser } from "@/lib/auth/current-user";
import { Shell } from "@/components/layout/shell";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { Badge, statusVariant } from "@/components/ui/badge";
import { getCampaign, listAudiencesForCampaign } from "@/lib/campaigns/queries";
import { listAds } from "@/lib/ads/queries";
import { getArtist } from "@/lib/artists/queries";
import { getRelease } from "@/lib/releases/queries";

export default async function AdsPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const { id } = await params;
  const campaign = await getCampaign(id);
  if (!campaign) notFound();
  const [artist, release, audiences, ads] = await Promise.all([
    getArtist(campaign.artistId),
    getRelease(campaign.releaseId),
    listAudiencesForCampaign(campaign.id),
    listAds({ campaignId: campaign.id }),
  ]);
  const audienceName = new Map(audiences.map((a) => [a.id, a.name]));

  return (
    <Shell email={user.email}>
      <PageHeader
        eyebrow={`${artist?.name} — ${release?.title}`}
        title="Ads"
        description="Every ad in this campaign, all generations."
        actions={
          <Link href={`/campaigns/${id}/ads/new`}>
            <Button>+ New ad</Button>
          </Link>
        }
      />

      {ads.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            title="No ads yet"
            description="Hand-write the first ad to bootstrap this campaign."
            action={
              <Link href={`/campaigns/${id}/ads/new`}>
                <Button>+ New ad</Button>
              </Link>
            }
          />
        </div>
      ) : (
        <Card className="mt-8">
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="text-muted-foreground">
                <tr className="border-b border-border-subtle">
                  <th className="text-left font-medium px-5 py-3 label">Gen</th>
                  <th className="text-left font-medium px-5 py-3 label">Status</th>
                  <th className="text-left font-medium px-5 py-3 label">Headline</th>
                  <th className="text-left font-medium px-5 py-3 label">Audience</th>
                  <th className="text-left font-medium px-5 py-3 label">FB ID</th>
                </tr>
              </thead>
              <tbody>
                {ads.map((ad) => (
                  <tr key={ad.id} className="border-b border-border-subtle last:border-0 hover:bg-surface-2/40 transition-colors">
                    <td className="px-5 py-3 num text-xs text-muted-foreground">gen{ad.generation}</td>
                    <td className="px-5 py-3"><Badge variant={statusVariant(ad.status)}>{ad.status}</Badge></td>
                    <td className="px-5 py-3 font-medium truncate max-w-[20rem]">{ad.copyHeadline}</td>
                    <td className="px-5 py-3 text-muted-foreground">{audienceName.get(ad.audienceId) ?? "—"}</td>
                    <td className="px-5 py-3 num text-xs text-muted-foreground">{ad.fbAdId ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </Shell>
  );
}
