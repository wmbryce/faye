import { redirect } from "next/navigation";
import Link from "next/link";
import { currentUser } from "@/lib/auth/current-user";
import { Shell } from "@/components/layout/shell";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Stat } from "@/components/ui/stat";
import { getCampaignContext } from "@/lib/campaigns/queries";
import { dailyCosts, llmCostByKind } from "@/lib/costs/aggregate";
import { getCampaignStreamDelta, getCampaignDegradedFlags } from "@/lib/metrics/queries";
import { DegradedBanner } from "@/components/degraded-banner";
import { CostsChart } from "@/components/charts/costs-chart";

export default async function CostsPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const { id } = await params;
  const { campaign, artist, release } = await getCampaignContext(id);

  const [costRows, llmByKind, { totalDelta: totalStreamsDelta }, flags] = await Promise.all([
    dailyCosts({ campaignId: id, fromDate: campaign.startDate, toDate: campaign.endDate }),
    llmCostByKind(id),
    getCampaignStreamDelta({
      releaseId: release.id,
      campaignStartDate: campaign.startDate,
      fromDate: campaign.startDate,
      toDate: campaign.endDate,
    }),
    getCampaignDegradedFlags({
      campaignId: id,
      releaseId: release.id,
      fromDate: campaign.startDate,
      toDate: campaign.endDate,
    }),
  ]);

  const totalAdSpendCents = costRows.reduce((a, r) => a + r.adSpendCents, 0);
  const totalLLMCents = costRows.reduce((a, r) => a + r.llmCostCents, 0);
  const totalCents = totalAdSpendCents + totalLLMCents;

  const costPerStreamCents = totalStreamsDelta > 0 ? totalCents / totalStreamsDelta : null;

  const chartData = costRows.map((r) => ({
    date: r.date,
    adSpend: r.adSpendCents / 100,
    llm: r.llmCostCents / 100,
  }));

  return (
    <Shell email={user.email}>
      <PageHeader
        eyebrow={`${artist.name} — ${release.title}`}
        title="Costs"
        actions={
          <Link href={`/campaigns/${id}`}>
            <Button variant="ghost" size="sm">← Back to campaign</Button>
          </Link>
        }
      />

      <DegradedBanner s4aMissing={flags.s4aMissing} fraudExcluded={flags.fraudExcluded} />

      <section className="mt-8 grid sm:grid-cols-4 gap-3">
        <Card><CardContent className="p-5"><Stat label="Ad spend" value={`$${(totalAdSpendCents / 100).toFixed(2)}`} /></CardContent></Card>
        <Card><CardContent className="p-5"><Stat label="LLM cost" value={`$${(totalLLMCents / 100).toFixed(2)}`} /></CardContent></Card>
        <Card><CardContent className="p-5"><Stat label="Total" value={`$${(totalCents / 100).toFixed(2)}`} /></CardContent></Card>
        <Card><CardContent className="p-5"><Stat label="Cost / incremental stream" value={costPerStreamCents == null ? "—" : `$${(costPerStreamCents / 100).toFixed(3)}`} hint={totalStreamsDelta > 0 ? `${totalStreamsDelta} streams above baseline` : "no streams above baseline"} /></CardContent></Card>
      </section>

      <section className="mt-10">
        <h2 className="label mb-3">Daily cost breakdown</h2>
        <Card><CardContent className="p-5"><CostsChart data={chartData} /></CardContent></Card>
      </section>

      <section className="mt-10">
        <h2 className="label mb-3">LLM cost by pass</h2>
        <Card>
          <CardContent className="p-5">
            <dl className="grid grid-cols-[8rem_1fr] gap-y-2 text-sm">
              <dt className="label">Critique</dt><dd className="num">${(llmByKind.critique / 100).toFixed(2)}</dd>
              <dt className="label">Generate</dt><dd className="num">${(llmByKind.generate / 100).toFixed(2)}</dd>
              <dt className="label">Safety</dt><dd className="num">${(llmByKind.safety / 100).toFixed(2)}</dd>
              <dt className="label">Total</dt><dd className="num">${(llmByKind.total / 100).toFixed(2)}</dd>
            </dl>
          </CardContent>
        </Card>
      </section>
    </Shell>
  );
}
