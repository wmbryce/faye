import "dotenv/config";
import { pullDailyMetrics } from "@/lib/metrics/pull";
import { dateArgOrYesterday, resolveCampaignIds } from "@/scripts/_shared";

async function main() {
  const date = dateArgOrYesterday();
  const ids = await resolveCampaignIds();

  if (!ids) {
    console.error("usage: tsx scripts/metrics-pull.ts (--all | --campaign <id>) [--date YYYY-MM-DD]");
    process.exit(2);
  }

  console.log(`metrics-pull: ${ids.length} campaigns for date=${date}`);
  let hadErrors = false;
  for (const id of ids) {
    try {
      const r = await pullDailyMetrics({ campaignId: id, date });
      console.log(`  campaign=${id} ads=${r.adsProcessed} smartlinkClicks=${r.smartlinkClicksTotal} streams=${r.spotifyStreams ?? "—"} (${r.spotifySource})`);
    } catch (err) {
      hadErrors = true;
      console.error(`  campaign=${id} error=${err instanceof Error ? err.message : String(err)}`);
    }
  }
  if (hadErrors) process.exitCode = 1;
}

main().catch((err) => { console.error(err); process.exit(1); });
