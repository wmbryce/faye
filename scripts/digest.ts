import "dotenv/config";
import { arg, yesterdayISO } from "./_shared";
import { listCampaignIdsWithPendingAds, runDigest } from "@/lib/email/digest/run";

async function main() {
  const date = arg("date") ?? yesterdayISO();
  const all = process.argv.includes("--all");
  const campaignArg = arg("campaign");

  let campaignIds: string[];
  if (campaignArg) {
    campaignIds = [campaignArg];
  } else if (all) {
    campaignIds = await listCampaignIdsWithPendingAds();
  } else {
    console.error("usage: tsx scripts/digest.ts (--all | --campaign <id>) [--date YYYY-MM-DD]");
    process.exit(2);
  }

  if (campaignIds.length === 0) {
    console.log(`digest: 0 campaigns with pending ads — skipping send`);
    return;
  }

  const result = await runDigest({ campaignIds, date });

  for (const { campaignId, error } of result.buildErrors) {
    console.error(`  campaign=${campaignId} build error=${error}`);
  }

  if (result.campaignsBuilt === 0) {
    console.log(`digest: all builds failed — skipping send`);
    process.exitCode = 1;
    return;
  }

  if (result.buildErrors.length > 0) {
    process.exitCode = 1;
  }

  console.log(`digest: sent msgId=${result.msgId} (${result.campaignsBuilt} campaigns)`);
}

main().then(() => process.exit(process.exitCode ?? 0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
