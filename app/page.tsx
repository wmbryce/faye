import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/current-user";
import { Shell } from "@/components/layout/shell";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Stat } from "@/components/ui/stat";
import { cn } from "@/lib/utils";
import {
  getDashboardSummary,
  listActiveCampaigns,
  listPendingApprovals,
} from "@/lib/dashboard/queries";

const LIST_ROW = "flex items-center gap-4 px-5 py-3 text-sm hover:bg-surface-2 transition-colors";

export default async function HomePage() {
  const user = await currentUser();
  if (!user) redirect("/login");

  const summary = await getDashboardSummary();
  const [pending, active] = await Promise.all([
    summary.pendingAdCount > 0 ? listPendingApprovals() : [],
    summary.activeCampaignCount > 0 ? listActiveCampaigns() : [],
  ]);

  return (
    <Shell email={user.email}>
      <PageHeader
        eyebrow="Dashboard"
        title="Welcome back"
        description="Faye places Facebook ads to drive Spotify listens. Approve pending ads below or jump into a campaign."
        actions={
          <Link href="/artists">
            <Button variant="outline" size="sm">Manage artists →</Button>
          </Link>
        }
      />

      <section className="mt-8 grid sm:grid-cols-3 gap-4">
        <StatTile label="Artists" value={summary.artistCount} href="/artists" />
        <StatTile label="Active campaigns" value={summary.activeCampaignCount} href="/campaigns" />
        <StatTile label="Pending approvals" value={summary.pendingAdCount} accent={summary.pendingAdCount > 0} />
      </section>

      <section className="mt-10">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="label">Pending approvals</h2>
          {summary.pendingAdCount > pending.length && (
            <span className="text-xs text-muted-foreground">showing {pending.length} of {summary.pendingAdCount}</span>
          )}
        </div>
        {pending.length === 0 ? (
          <Card><CardContent className="p-5 text-sm text-muted-foreground">No ads waiting for review.</CardContent></Card>
        ) : (
          <Card>
            <CardContent className="p-0 divide-y divide-border-subtle">
              {pending.map((p) => (
                <Link
                  key={p.adId}
                  href={`/campaigns/${p.campaignId}/review`}
                  className={LIST_ROW}
                >
                  <Badge variant="accent">pending</Badge>
                  <span className="flex-1 min-w-0 truncate">
                    <span className="font-medium">{p.copyHeadline}</span>
                    <span className="ml-2 text-muted-foreground">— {p.artistName} · {p.releaseTitle}</span>
                  </span>
                  <span className="text-xs text-muted-foreground shrink-0">{formatRelative(p.createdAt)}</span>
                </Link>
              ))}
            </CardContent>
          </Card>
        )}
      </section>

      <section className="mt-10">
        <h2 className="label mb-3">Active campaigns</h2>
        {active.length === 0 ? (
          <Card><CardContent className="p-5 text-sm text-muted-foreground">No active campaigns yet.</CardContent></Card>
        ) : (
          <Card>
            <CardContent className="p-0 divide-y divide-border-subtle">
              {active.map((c) => (
                <Link
                  key={c.id}
                  href={`/campaigns/${c.id}`}
                  className={LIST_ROW}
                >
                  <span className="flex-1 min-w-0 truncate">
                    <span className="font-medium">{c.artistName}</span>
                    <span className="ml-2 text-muted-foreground">— {c.releaseTitle}</span>
                  </span>
                  <span className="num text-xs text-muted-foreground shrink-0">
                    ${(c.dailyBudgetCents / 100).toFixed(0)}/day · {c.startDate} → {c.endDate}
                  </span>
                </Link>
              ))}
            </CardContent>
          </Card>
        )}
      </section>
    </Shell>
  );
}

function StatTile({ label, value, href, accent }: { label: string; value: number; href?: string; accent?: boolean }) {
  const card = (
    <Card className={cn(accent && "border-accent/40")}>
      <CardContent className="p-5">
        <Stat label={label} value={value} />
      </CardContent>
    </Card>
  );
  return href ? <Link href={href} className="block">{card}</Link> : card;
}

function formatRelative(date: Date): string {
  const diffMs = Date.now() - new Date(date).getTime();
  const m = Math.floor(diffMs / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}
