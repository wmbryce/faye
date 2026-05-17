import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { currentUser } from "@/lib/auth/current-user";
import { Shell } from "@/components/layout/shell";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { getCampaign } from "@/lib/campaigns/queries";
import { listAuditFor } from "@/lib/audit/queries";
import { getArtist } from "@/lib/artists/queries";
import { getRelease } from "@/lib/releases/queries";

export default async function CampaignAuditPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const { id } = await params;
  const campaign = await getCampaign(id);
  if (!campaign) notFound();
  const [artist, release, entries] = await Promise.all([
    getArtist(campaign.artistId),
    getRelease(campaign.releaseId),
    listAuditFor("campaign", id, { limit: 500 }),
  ]);

  return (
    <Shell email={user.email}>
      <PageHeader
        eyebrow={`${artist?.name} — ${release?.title}`}
        title="Audit log"
        description="Every mutating action on this campaign, most recent first."
        actions={
          <Link href={`/campaigns/${id}`}>
            <span className="text-sm text-muted-foreground hover:text-foreground transition-colors">← Back to campaign</span>
          </Link>
        }
      />
      <div className="mt-8">
        {entries.length === 0 ? (
          <EmptyState title="No audit entries yet" description="This shouldn't happen for an activated campaign — re-create if you see this." />
        ) : (
          <Card>
            <CardContent className="p-0">
              <ul className="divide-y divide-border-subtle">
                {entries.map((e) => (
                  <li key={e.id} className="px-5 py-3 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <Badge variant="muted">{e.event}</Badge>
                        <span className="font-mono text-xs text-muted-foreground">{e.createdAt.toISOString()}</span>
                      </div>
                    </div>
                    {e.payload != null && (
                      <pre className="mt-2 text-xs overflow-x-auto bg-surface-2 border border-border-subtle rounded-md p-3 font-mono">
                        {JSON.stringify(e.payload, null, 2)}
                      </pre>
                    )}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>
    </Shell>
  );
}
