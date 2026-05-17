import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/current-user";
import { Nav } from "@/components/layout/nav";

export default async function SettingsPage() {
  const user = await currentUser();
  if (!user) redirect("/login");

  return (
    <>
      <Nav email={user.email} />
      <main className="max-w-5xl mx-auto px-6 py-10">
        <h1 className="text-2xl font-semibold mb-4">Settings</h1>
        <p className="text-muted-foreground">
          Coming soon — review delay, K/N, weights, API keys.
        </p>
      </main>
    </>
  );
}
