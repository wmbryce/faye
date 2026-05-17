import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/current-user";
import { Shell } from "@/components/layout/shell";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default async function SettingsPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  return (
    <Shell email={user.email}>
      <PageHeader
        eyebrow="Settings"
        title="Settings"
        description="Configuration for review delay, K/N bandit defaults, composite-score weights, and provider API keys. Lands in Phase 3."
      />
      <Card className="mt-8">
        <CardHeader>
          <CardTitle>Defaults (read-only for now)</CardTitle>
          <CardDescription>
            These are the v1 spec defaults. Editable controls land in Phase 3 along with provider credentials.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="text-sm grid grid-cols-[10rem_1fr] gap-y-2">
            <dt className="label">Review delay</dt><dd className="num">30 min</dd>
            <dt className="label">K survivors</dt><dd className="num">3</dd>
            <dt className="label">N variants</dt><dd className="num">5</dd>
            <dt className="label">Composite weights</dt><dd className="num">0.6 / 0.2 / 0.2</dd>
            <dt className="label">Max audiences</dt><dd className="num">5</dd>
            <dt className="label">Models</dt><dd className="num">Sonnet 4.6 / Opus 4.7 / Haiku 4.5</dd>
          </dl>
        </CardContent>
      </Card>
    </Shell>
  );
}
