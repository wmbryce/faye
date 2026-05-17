import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { currentUser } from "@/lib/auth/current-user";
import { Shell } from "@/components/layout/shell";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { getCampaign } from "@/lib/campaigns/queries";
import { listPendingAdsForReview } from "@/lib/ads/queries";
import { getArtist } from "@/lib/artists/queries";
import { getRelease } from "@/lib/releases/queries";
import { approveAction, rejectAction } from "./actions";

export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const { id } = await params;
  const campaign = await getCampaign(id);
  if (!campaign) notFound();
  const [artist, release] = await Promise.all([
    getArtist(campaign.artistId),
    getRelease(campaign.releaseId),
  ]);

  const rows = await listPendingAdsForReview(id);

  return (
    <Shell email={user.email}>
      <PageHeader
        eyebrow={`${artist?.name} — ${release?.title}`}
        title="Pending review"
        description={`${rows.length} ad${rows.length === 1 ? "" : "s"} waiting to publish. Approve to push now, or reject to keep off Facebook.`}
        actions={
          <Link href={`/campaigns/${id}`}>
            <Button variant="ghost" size="sm">← Back to campaign</Button>
          </Link>
        }
      />

      <div className="mt-8 space-y-3">
        {rows.length === 0 ? (
          <EmptyState
            title="Nothing pending"
            description="When Faye's daily loop stages new variants, they appear here for review before going live."
          />
        ) : (
          rows.map(({ ad, audience, asset }) => (
            <Card key={ad.id}>
              <CardContent className="p-5">
                <div className="flex gap-5">
                  <img
                    src={asset.url}
                    alt=""
                    className="w-32 h-32 object-cover rounded-md border border-border-subtle shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-3 mb-1">
                      <Badge variant="muted">{audience.name}</Badge>
                      {ad.publishAt && (
                        <span className="text-xs text-muted-foreground">
                          scheduled {new Date(ad.publishAt).toLocaleString()}
                        </span>
                      )}
                    </div>
                    <p className="font-medium">{ad.copyHeadline}</p>
                    <p className="text-sm text-muted-foreground mt-1">{ad.copyPrimaryText}</p>
                    {ad.copyBody && (
                      <p className="text-xs text-muted-foreground mt-1">{ad.copyBody}</p>
                    )}
                    <div className="flex gap-2 mt-4">
                      <form action={approveAction.bind(null, id, ad.id)}>
                        <Button type="submit" size="sm">Approve now</Button>
                      </form>
                      <form action={rejectAction.bind(null, id, ad.id)}>
                        <Button type="submit" size="sm" variant="destructive">Reject</Button>
                      </form>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </Shell>
  );
}
