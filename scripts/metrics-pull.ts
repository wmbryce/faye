import "dotenv/config";
import { pullDailyMetrics } from "@/lib/metrics/pull";
import { arg, yesterdayISO, resolveCampaignIds } from "@/scripts/_shared";

async function main() {
  const date = arg("date") ?? yesterdayISO();
  const ids = await resolveCampaignIds();

  if (!ids) {
    console.error("usage: tsx scripts/metrics-pull.ts (--all | --campaign <id>) [--date YYYY-MM-DD]");
    process.exit(2);
  }

  console.log(`metrics-pull: ${ids.length} campaigns for date=${date}`);
  for (const id of ids) {
    try {
      const r = await pullDailyMetrics({ campaignId: id, date });
      console.log(`  campaign=${id} ads=${r.adsProcessed} smartlinkClicks=${r.smartlinkClicksTotal} streams=${r.spotifyStreams ?? "—"} (${r.spotifySource})`);
    } catch (err) {
      console.error(`  campaign=${id} error=${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
