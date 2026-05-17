import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/current-user";
import { Shell } from "@/components/layout/shell";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge, statusVariant } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { listCampaigns, listAudiencesForCampaign } from "@/lib/campaigns/queries";
import { listAds } from "@/lib/ads/queries";
import { getArtist } from "@/lib/artists/queries";
import { getRelease } from "@/lib/releases/queries";

export default async function CampaignsPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  const campaigns = await listCampaigns();

  // Resolve artist/release/counts in parallel per row.
  const enriched = await Promise.all(campaigns.map(async (c) => {
    const [artist, release, audiences, ads] = await Promise.all([
      getArtist(c.artistId),
      getRelease(c.releaseId),
      listAudiencesForCampaign(c.id),
      listAds({ campaignId: c.id }),
    ]);
    return { campaign: c, artist, release, audienceCount: audiences.length, adCount: ads.length };
  }));

  return (
    <Shell email={user.email}>
      <PageHeader
        eyebrow="Roster"
        title="Campaigns"
        description="One campaign per release. Faye runs the daily loop inside each campaign window."
      />
      {enriched.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            title="No campaigns yet"
            description="Create a campaign from an artist's page (Artists → pick artist → New campaign)."
            action={<Link href="/artists"><Button>Go to artists</Button></Link>}
          />
        </div>
      ) : (
        <ul className="mt-8 grid sm:grid-cols-2 gap-4">
          {enriched.map(({ campaign, artist, release, audienceCount, adCount }) => (
            <li key={campaign.id}>
              <Link href={`/campaigns/${campaign.id}`} className="block group">
                <Card className="transition-colors group-hover:bg-surface-2/40 group-hover:border-border">
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="font-medium tracking-tight truncate">
                          {artist?.name ?? "?"} — {release?.title ?? "?"}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {campaign.startDate} → {campaign.endDate}
                        </div>
                      </div>
                      <Badge variant={statusVariant(campaign.status)}>{campaign.status}</Badge>
                    </div>
                    <dl className="mt-4 grid grid-cols-3 gap-2 text-xs">
                      <div>
                        <dt className="label">Daily</dt>
                        <dd className="num">${(campaign.dailyBudgetCents / 100).toFixed(2)}</dd>
                      </div>
                      <div>
                        <dt className="label">Audiences</dt>
                        <dd className="num">{audienceCount}</dd>
                      </div>
                      <div>
                        <dt className="label">Ads</dt>
                        <dd className="num">{adCount}</dd>
                      </div>
                    </dl>
                  </CardContent>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Shell>
  );
}
