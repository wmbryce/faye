import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/current-user";
import { Nav } from "@/components/layout/nav";

export default async function HomePage() {
  const user = await currentUser();
  if (!user) redirect("/login");

  return (
    <>
      <Nav email={user.email} />
      <main className="max-w-5xl mx-auto px-6 py-10">
        <h1 className="text-2xl font-semibold mb-2">Campaigns</h1>
        <p className="text-muted-foreground">No campaigns yet.</p>
      </main>
    </>
  );
}
