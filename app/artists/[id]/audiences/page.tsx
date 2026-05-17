import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { currentUser } from "@/lib/auth/current-user";
import { Nav } from "@/components/layout/nav";
import { getArtist } from "@/lib/artists/queries";
import { listAudienceSeeds } from "@/lib/audiences/queries";
import { Button } from "@/components/ui/button";

export default async function AudiencesPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const { id } = await params;
  const artist = await getArtist(id);
  if (!artist) notFound();
  const rows = await listAudienceSeeds(id);
  return (
    <>
      <Nav email={user.email} />
      <main className="max-w-5xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-semibold">{artist.name} — audience seeds</h1>
          <Link href={`/artists/${id}/audiences/new`}><Button>Add seed</Button></Link>
        </div>
        {rows.length === 0 ? (
          <p className="text-muted-foreground">No audience seeds yet.</p>
        ) : (
          <ul className="space-y-3">
            {rows.map((s) => (
              <li key={s.id} className="border border-border rounded-md p-4">
                <div className="font-medium mb-2">{s.name}</div>
                <pre className="text-xs overflow-x-auto bg-muted p-3 rounded">{JSON.stringify(s.targetingSpec, null, 2)}</pre>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
