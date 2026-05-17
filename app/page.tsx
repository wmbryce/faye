import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/current-user";
import { Nav } from "@/components/layout/nav";

export default async function HomePage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  return (
    <>
      <Nav email={user.email} />
      <main className="max-w-5xl mx-auto px-6 py-10 space-y-6">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p>
          <Link href="/artists" className="underline">Manage artists</Link>
        </p>
        <p className="text-muted-foreground">Campaigns dashboard coming in Phase 4.</p>
      </main>
    </>
  );
}
