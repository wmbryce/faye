import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { currentUser } from "@/lib/auth/current-user";
import { Shell } from "@/components/layout/shell";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { pauseAdAction, killAdAction } from "./actions";
import { EmptyState } from "@/components/ui/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { Badge, statusVariant } from "@/components/ui/badge";
import { getCampaign } from "@/lib/campaigns/queries";
import { listAdsRichForCampaign } from "@/lib/ads/queries";
import { getArtist } from "@/lib/artists/queries";
import { getRelease } from "@/lib/releases/queries";

function fmtMoney(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function fmtNum(n: number | null) {
  if (n == null) return "—";
  return n.toLocaleString();
}

export default async function AdsPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const { id } = await params;
  const campaign = await getCampaign(id);
  if (!campaign) notFound();
  const [artist, release, rows] = await Promise.all([
    getArtist(campaign.artistId),
    getRelease(campaign.releaseId),
    listAdsRichForCampaign(campaign.id),
  ]);

  return (
    <Shell email={user.email}>
      <PageHeader
        eyebrow={`${artist?.name} — ${release?.title}`}
        title="Ads"
        description="Every ad in this campaign, sorted by composite score."
        actions={
          <Link href={`/campaigns/${id}/ads/new`}>
            <Button>+ New ad</Button>
          </Link>
        }
      />

      {rows.length === 0 ? (
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
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-muted-foreground">
                  <tr className="border-b border-border-subtle">
                    <th className="text-left font-medium px-4 py-3 label whitespace-nowrap">Gen</th>
                    <th className="text-left font-medium px-4 py-3 label whitespace-nowrap">Status</th>
                    <th className="text-left font-medium px-4 py-3 label">Headline</th>
                    <th className="text-left font-medium px-4 py-3 label">Audience</th>
                    <th className="text-right font-medium px-4 py-3 label whitespace-nowrap">Spend</th>
                    <th className="text-right font-medium px-4 py-3 label whitespace-nowrap">Imps</th>
                    <th className="text-right font-medium px-4 py-3 label whitespace-nowrap">FB Clicks</th>
                    <th className="text-right font-medium px-4 py-3 label whitespace-nowrap">SL Clicks</th>
                    <th className="text-right font-medium px-4 py-3 label whitespace-nowrap">Streams</th>
                    <th className="text-right font-medium px-4 py-3 label whitespace-nowrap">Composite</th>
                    <th className="text-left font-medium px-4 py-3 label whitespace-nowrap">FB ID</th>
                    <th className="text-left font-medium px-4 py-3 label whitespace-nowrap">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ ad, audienceName, lifetimeSpendCents, lifetimeImpressions, lifetimeFbClicks, lifetimeSmartlinkClicks, lifetimeStreams, latestComposite }) => (
                    <tr key={ad.id} className="border-b border-border-subtle last:border-0 hover:bg-surface-2/40 transition-colors">
                      <td className="px-4 py-3 num text-xs text-muted-foreground whitespace-nowrap">gen{ad.generation}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <Badge variant={statusVariant(ad.status)}>{ad.status}</Badge>
                      </td>
                      <td className="px-4 py-3 font-medium truncate max-w-[18rem]">
                        {ad.parentAdId && <span className="text-muted-foreground mr-1">↳</span>}
                        {ad.copyHeadline}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{audienceName}</td>
                      <td className="px-4 py-3 num text-xs text-right whitespace-nowrap">{fmtMoney(lifetimeSpendCents)}</td>
                      <td className="px-4 py-3 num text-xs text-right whitespace-nowrap">{fmtNum(lifetimeImpressions)}</td>
                      <td className="px-4 py-3 num text-xs text-right whitespace-nowrap">{fmtNum(lifetimeFbClicks)}</td>
                      <td className="px-4 py-3 num text-xs text-right whitespace-nowrap">{fmtNum(lifetimeSmartlinkClicks)}</td>
                      <td className="px-4 py-3 num text-xs text-right whitespace-nowrap">{fmtNum(lifetimeStreams)}</td>
                      <td className="px-4 py-3 num text-xs text-right whitespace-nowrap">
                        {latestComposite == null ? "—" : latestComposite.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 num text-xs text-muted-foreground whitespace-nowrap">{ad.fbAdId ?? "—"}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex gap-2 items-center">
                          {ad.status === "published" && (
                            <form action={pauseAdAction.bind(null, id, ad.id)}>
                              <Button type="submit" variant="ghost" size="sm">Pause</Button>
                            </form>
                          )}
                          {(ad.status === "published" || ad.status === "paused") && (
                            <form action={killAdAction.bind(null, id, ad.id)}>
                              <Button type="submit" variant="ghost" size="sm">Kill</Button>
                            </form>
                          )}
                          {ad.status !== "published" && ad.status !== "paused" && (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </Shell>
  );
}
