import "dotenv/config";
import { runBanditStep } from "@/lib/bandit/step";
import { dateArgOrYesterday, resolveCampaignIds } from "@/scripts/_shared";

async function main() {
  const date = dateArgOrYesterday();
  const ids = await resolveCampaignIds();

  if (!ids) {
    console.error("usage: tsx scripts/bandit-step.ts (--all | --campaign <id>) [--date YYYY-MM-DD]");
    process.exit(2);
  }

  console.log(`bandit-step: ${ids.length} campaigns for date=${date}`);
  let hadErrors = false;
  for (const id of ids) {
    try {
      const r = await runBanditStep({ campaignId: id, date });
      console.log(`  campaign=${id} audiences=${r.audiencesProcessed} ranked=${r.adsRanked} paused=${r.adsPaused} fraud=${r.adsFlaggedFraud} reweighted=${r.budgetsReweighted} archived=${r.adsArchived}`);
    } catch (err) {
      hadErrors = true;
      console.error(`  campaign=${id} error=${err instanceof Error ? err.message : String(err)}`);
    }
  }
  if (hadErrors) process.exitCode = 1;
}

main().catch((err) => { console.error(err); process.exit(1); });
