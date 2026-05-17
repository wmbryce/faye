import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/current-user";
import { Shell } from "@/components/layout/shell";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { listArtists } from "@/lib/artists/queries";

export default async function HomePage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  const artists = await listArtists();

  return (
    <Shell email={user.email}>
      <PageHeader
        eyebrow="Dashboard"
        title="Welcome back"
        description="Faye places Facebook ads to drive Spotify listens for your artists. Start by adding an artist; campaigns and the autonomous loop come online in later phases."
        actions={
          <Link href="/artists">
            <Button variant="outline" size="sm">Manage artists →</Button>
          </Link>
        }
      />

      <section className="mt-8 grid sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="font-mono tabular-nums text-2xl">{artists.length}</CardTitle>
            <CardDescription>Artists</CardDescription>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="font-mono tabular-nums text-2xl">0</CardTitle>
            <CardDescription>Active campaigns</CardDescription>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle><Badge variant="muted">Phase 4 →</Badge></CardTitle>
            <CardDescription>Campaigns ship soon</CardDescription>
          </CardHeader>
        </Card>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-medium mb-4">Build path</h2>
        <ol className="space-y-0">
          <BuildStep status="done" label="Phase 1" title="Foundations" note="auth, db, design system" />
          <BuildStep status="done" label="Phase 2" title="Artist & asset management" note="onboard artists, upload assets, releases + audience seeds" />
          <BuildStep status="next" label="Phase 3" title="External clients" note="FB / Feature.fm / Spotify / OpenRouter" />
          <BuildStep status="todo" label="Phase 4" title="Campaign creation + manual publishing" />
          <BuildStep status="todo" label="Phase 5" title="Composite scoring + bandit" />
          <BuildStep status="todo" label="Phase 6" title="LLM daily loop" />
          <BuildStep status="todo" label="Phase 7" title="Email digest + approve/reject" />
          <BuildStep status="todo" label="Phase 8" title="Dashboards + cost tracking" />
        </ol>
      </section>
    </Shell>
  );
}

function BuildStep({ status, label, title, note }: { status: "done" | "next" | "todo"; label: string; title: string; note?: string }) {
  return (
    <li className="flex items-center gap-4 py-3 border-b border-border-subtle last:border-0 text-sm">
      <span className="font-mono text-xs text-muted-foreground w-16 shrink-0">{label}</span>
      <span className="shrink-0">
        {status === "done" && <Badge variant="success">shipped</Badge>}
        {status === "next" && <Badge variant="accent">next</Badge>}
        {status === "todo" && <Badge variant="muted">todo</Badge>}
      </span>
      <span className="flex-1 min-w-0">
        <span className="font-medium">{title}</span>
        {note && <span className="ml-2 text-muted-foreground">— {note}</span>}
      </span>
    </li>
  );
}
