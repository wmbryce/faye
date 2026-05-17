import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { currentUser } from "@/lib/auth/current-user";
import { Shell } from "@/components/layout/shell";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge, statusVariant } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Stat } from "@/components/ui/stat";
import { EmptyState } from "@/components/ui/empty-state";
import { getCampaign, listAudiencesForCampaign } from "@/lib/campaigns/queries";
import { listAds } from "@/lib/ads/queries";
import { getArtist } from "@/lib/artists/queries";
import { getRelease } from "@/lib/releases/queries";
import { AdCard } from "@/components/campaigns/ad-card";

export default async function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
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

  const adsByAudience = new Map<string, typeof ads>();
  for (const a of ads) {
    const list = adsByAudience.get(a.audienceId) ?? [];
    list.push(a);
    adsByAudience.set(a.audienceId, list);
  }

  const lifecycleDisabled = campaign.status === "ended";

  return (
    <Shell email={user.email}>
      <PageHeader
        eyebrow={<span>{artist?.name}</span>}
        title={
          <span className="flex items-center gap-3">
            {release?.title ?? "?"}
            <Badge variant={statusVariant(campaign.status)}>{campaign.status}</Badge>
          </span>
        }
        description={`${campaign.startDate} → ${campaign.endDate}`}
        actions={
          <div className="flex gap-2">
            <Link href={`/campaigns/${campaign.id}/ads/new`}>
              <Button size="sm">+ New ad</Button>
            </Link>
            {/* Lifecycle wired in T8 */}
            <Button variant="outline" size="sm" disabled>Pause</Button>
            <Button variant="outline" size="sm" disabled>Resume</Button>
            <Button variant="destructive" size="sm" disabled={lifecycleDisabled}>End</Button>
          </div>
        }
      />

      <section className="mt-8 grid sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-5">
            <Stat label="Daily budget" value={`$${(campaign.dailyBudgetCents / 100).toFixed(2)}`} />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <Stat label="Audiences" value={audiences.length} />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <Stat label="Ads" value={ads.length} />
          </CardContent>
        </Card>
      </section>

      <section className="mt-10">
        <h2 className="label mb-3">Audiences</h2>
        {audiences.length === 0 ? (
          <p className="text-sm text-muted-foreground">No audiences. (Should not happen if campaign was activated.)</p>
        ) : (
          <ul className="space-y-3">
            {audiences.map((aud) => {
              const audAds = adsByAudience.get(aud.id) ?? [];
              return (
                <li key={aud.id}>
                  <Card>
                    <CardHeader>
                      <div className="flex items-center justify-between gap-3">
                        <CardTitle>{aud.name}</CardTitle>
                        <span className="text-xs font-mono text-muted-foreground">{aud.fbAdSetId}</span>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0 space-y-3">
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span><span className="label">Daily</span> <span className="num ml-1">${(aud.dailyBudgetCents / 100).toFixed(2)}</span></span>
                        <span><span className="label">Ads</span> <span className="num ml-1">{audAds.length}</span></span>
                      </div>
                      {audAds.length === 0 ? (
                        <p className="text-xs text-muted-foreground italic">No ads in this audience yet.</p>
                      ) : (
                        <ul className="space-y-2">
                          {audAds.map((a) => <AdCard key={a.id} ad={a} />)}
                        </ul>
                      )}
                    </CardContent>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {ads.length > 0 && (
        <p className="mt-6 text-sm">
          <Link href={`/campaigns/${campaign.id}/ads`} className="underline">View all ads →</Link>
        </p>
      )}

      {ads.length === 0 && (
        <section className="mt-10">
          <EmptyState
            title="No ads yet"
            description="Hand-write the first ad to bootstrap this campaign. Faye's autonomous loop generates new variants in Phase 6."
            action={
              <Link href={`/campaigns/${campaign.id}/ads/new`}>
                <Button>+ New ad</Button>
              </Link>
            }
          />
        </section>
      )}
    </Shell>
  );
}
