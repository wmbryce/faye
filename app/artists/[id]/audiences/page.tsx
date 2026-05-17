import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { currentUser } from "@/lib/auth/current-user";
import { Shell } from "@/components/layout/shell";
import { PageHeader } from "@/components/layout/page-header";
import { getArtist } from "@/lib/artists/queries";
import { listAudienceSeeds } from "@/lib/audiences/queries";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { archiveSeedAction } from "./actions";

export default async function AudiencesPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const { id } = await params;
  const artist = await getArtist(id);
  if (!artist) notFound();
  const rows = await listAudienceSeeds(id);
  return (
    <Shell email={user.email}>
      <PageHeader
        eyebrow={artist.name}
        title="Audience seeds"
        description="Reusable FB targeting specs. Pick 1–5 per campaign; Faye splits budget across them and reweighs daily."
        actions={
          <Link href={`/artists/${id}/audiences/new`}>
            <Button>+ Add seed</Button>
          </Link>
        }
      />
      <div className="mt-8">
        {rows.length === 0 ? (
          <EmptyState
            title="No audience seeds yet"
            description="Add a JSON targeting spec (interests, geo, age) so Faye has something to target."
            action={
              <Link href={`/artists/${id}/audiences/new`}>
                <Button>+ Add seed</Button>
              </Link>
            }
          />
        ) : (
          <ul className="space-y-3">
            {rows.map((s) => (
              <li key={s.id}>
                <Card>
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="font-medium">{s.name}</div>
                      <form action={archiveSeedAction.bind(null, id, s.id)}>
                        <button
                          type="submit"
                          className="text-xs text-muted-foreground hover:text-danger transition-colors"
                        >
                          Archive
                        </button>
                      </form>
                    </div>
                    <pre className="mt-3 text-xs overflow-x-auto bg-surface-2 border border-border-subtle rounded-md p-3 font-mono">
                      {JSON.stringify(s.targetingSpec, null, 2)}
                    </pre>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Shell>
  );
}
