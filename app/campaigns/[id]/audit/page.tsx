import { redirect } from "next/navigation";
import Link from "next/link";
import { currentUser } from "@/lib/auth/current-user";
import { Shell } from "@/components/layout/shell";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { getCampaignContext } from "@/lib/campaigns/queries";
import { listAuditForCampaignAndAds } from "@/lib/audit/queries";

export default async function CampaignAuditPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const { id } = await params;
  const { campaign, artist, release } = await getCampaignContext(id);
  const entries = await listAuditForCampaignAndAds(id, 500);

  return (
    <Shell email={user.email}>
      <PageHeader
        eyebrow={`${artist?.name} — ${release?.title}`}
        title="Audit log"
        description="Campaign and ad events, most recent first."
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
                      <div className="flex items-center gap-2 min-w-0 flex-wrap">
                        <Badge variant={e.entityType === "campaign" ? "accent" : "muted"}>{e.entityType}</Badge>
                        <span className="font-mono text-xs text-muted-foreground border border-border-subtle bg-surface-2 rounded px-1.5 py-0.5">{e.entityId}</span>
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
