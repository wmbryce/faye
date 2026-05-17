import "dotenv/config";
import { runBanditStep } from "@/lib/bandit/step";
import { arg, yesterdayISO, resolveCampaignIds } from "@/scripts/_shared";

async function main() {
  const date = arg("date") ?? yesterdayISO();
  const ids = await resolveCampaignIds();

  if (!ids) {
    console.error("usage: tsx scripts/bandit-step.ts (--all | --campaign <id>) [--date YYYY-MM-DD]");
    process.exit(2);
  }

  console.log(`bandit-step: ${ids.length} campaigns for date=${date}`);
  for (const id of ids) {
    try {
      const r = await runBanditStep({ campaignId: id, date });
      console.log(`  campaign=${id} audiences=${r.audiencesProcessed} ranked=${r.adsRanked} paused=${r.adsPaused} fraud=${r.adsFlaggedFraud} reweighted=${r.budgetsReweighted} archived=${r.adsArchived}`);
    } catch (err) {
      console.error(`  campaign=${id} error=${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
