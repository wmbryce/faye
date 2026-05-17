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
import { pauseCampaignAction, resumeCampaignAction, endCampaignAction } from "./actions";
import { RunDailyLoopButton } from "@/components/campaigns/run-daily-loop-button";
import { SpendStreamsChart } from "@/components/charts/spend-streams-chart";
import { spendStreamSeries } from "@/lib/metrics/timeseries";
import { getCampaignDegradedFlags } from "@/lib/metrics/queries";
import { DegradedBanner } from "@/components/degraded-banner";

export default async function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const { id } = await params;
  const campaign = await getCampaign(id);
  if (!campaign) notFound();
  const [artist, release, audiences, ads, series, flags] = await Promise.all([
    getArtist(campaign.artistId),
    getRelease(campaign.releaseId),
    listAudiencesForCampaign(campaign.id),
    listAds({ campaignId: campaign.id }),
    spendStreamSeries({
      campaignId: campaign.id,
      releaseId: campaign.releaseId,
      campaignStartDate: campaign.startDate,
      fromDate: campaign.startDate,
      toDate: campaign.endDate,
    }),
    getCampaignDegradedFlags({
      campaignId: campaign.id,
      releaseId: campaign.releaseId,
      fromDate: campaign.startDate,
      toDate: campaign.endDate,
    }),
  ]);
  const chartData = series.map((p) => ({
    date: p.date,
    spendUsd: p.spendCents / 100,
    streams: p.streams,
    baseline: p.baseline,
  }));

  const adsByAudience = new Map<string, typeof ads>();
  for (const a of ads) {
    const list = adsByAudience.get(a.audienceId) ?? [];
    list.push(a);
    adsByAudience.set(a.audienceId, list);
  }

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
          <div className="flex items-start gap-2">
            <Link href={`/campaigns/${campaign.id}/ads/new`}>
              <Button size="sm">+ New ad</Button>
            </Link>
            <RunDailyLoopButton campaignId={campaign.id} disabled={campaign.status === "ended"} />
            {campaign.status === "active" && (
              <form action={pauseCampaignAction.bind(null, campaign.id)}>
                <Button type="submit" variant="outline" size="sm">Pause</Button>
              </form>
            )}
            {campaign.status === "paused" && (
              <form action={resumeCampaignAction.bind(null, campaign.id)}>
                <Button type="submit" variant="outline" size="sm">Resume</Button>
              </form>
            )}
            {(campaign.status === "active" || campaign.status === "paused" || campaign.status === "draft") && (
              <form action={endCampaignAction.bind(null, campaign.id)}>
                <Button type="submit" variant="destructive" size="sm">End</Button>
              </form>
            )}
            <Link href={`/campaigns/${campaign.id}/review`}>
              <Button variant="ghost" size="sm">Review pending →</Button>
            </Link>
            <Link href={`/campaigns/${campaign.id}/audit`}>
              <Button variant="ghost" size="sm">Audit log →</Button>
            </Link>
            <Link href={`/campaigns/${campaign.id}/costs`}>
              <Button variant="ghost" size="sm">Costs →</Button>
            </Link>
          </div>
        }
      />

      <DegradedBanner s4aMissing={flags.s4aMissing} fraudExcluded={flags.fraudExcluded} />

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

      <section className="mt-8">
        <Card>
          <CardContent className="p-5">
            <SpendStreamsChart data={chartData} />
          </CardContent>
        </Card>
        {/* TODO: audience-budget chart pending audience_budget_daily snapshot — see plan 8 task 3 */}
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
