import "dotenv/config";
import { db } from "@/lib/db";
import { campaigns } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { runDailyLoop } from "@/lib/loop/daily";
import { shouldRunNow } from "@/lib/loop/schedule";
import { arg, yesterdayISO } from "./_shared";

async function main() {
  const explicitCampaign = arg("campaign");
  const explicitDate = arg("date");
  const all = process.argv.includes("--all");
  const force = process.argv.includes("--force");
  const now = new Date();

  let toRun: { id: string; timezone: string }[];
  if (explicitCampaign) {
    const [row] = await db
      .select({ id: campaigns.id, timezone: campaigns.timezone })
      .from(campaigns)
      .where(eq(campaigns.id, explicitCampaign))
      .limit(1);
    if (!row) {
      console.error(`no campaign with id=${explicitCampaign}`);
      process.exit(2);
    }
    toRun = [row];
  } else if (all) {
    const rows = await db
      .select({ id: campaigns.id, timezone: campaigns.timezone })
      .from(campaigns)
      .where(eq(campaigns.status, "active"));
    toRun = force ? rows : rows.filter((r) => shouldRunNow(now, r.timezone));
  } else {
    console.error(
      "usage: tsx scripts/daily.ts (--all [--force] | --campaign <id>) [--date YYYY-MM-DD]"
    );
    process.exit(2);
  }

  if (toRun.length === 0) {
    console.log(`daily: 0 campaigns to run at this hour`);
    return;
  }

  const yesterday = explicitDate ?? yesterdayISO();
  console.log(`daily: running ${toRun.length} campaign(s) for date=${yesterday}`);
  for (const { id } of toRun) {
    try {
      const r = await runDailyLoop({ campaignId: id, yesterday });
      console.log(
        `  campaign=${id} audiences=${r.audiencesProcessed} variants=${r.variantsGenerated} safe=${r.variantsSafe} blocked=${r.variantsBlocked} staged=${r.pendingAdsStaged} gen=${r.generation}`
      );
    } catch (err) {
      console.error(
        `  campaign=${id} error=${err instanceof Error ? err.message : String(err)}`
      );
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
