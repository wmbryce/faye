import "dotenv/config";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { ads, campaigns } from "@/lib/db/schema";
import { buildCampaignDigest } from "@/lib/email/digest/builder";
import { sendDailyDigest } from "@/lib/email/digest/send";
import { yesterdayISO } from "./_shared";

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const found = process.argv.find((a) => a.startsWith(prefix));
  if (found) return found.slice(prefix.length);
  const flat = process.argv.indexOf(`--${name}`);
  if (flat >= 0 && process.argv[flat + 1] && !process.argv[flat + 1].startsWith("--")) {
    return process.argv[flat + 1];
  }
  return undefined;
}

async function main() {
  const date = arg("date") ?? yesterdayISO();
  const all = process.argv.includes("--all");
  const campaignArg = arg("campaign");

  let campaignIds: string[];
  if (campaignArg) {
    campaignIds = [campaignArg];
  } else if (all) {
    // Active campaigns that have at least one pending ad right now
    const rows = await db
      .selectDistinct({ id: campaigns.id })
      .from(campaigns)
      .innerJoin(ads, eq(ads.campaignId, campaigns.id))
      .where(and(eq(campaigns.status, "active"), eq(ads.status, "pending")));
    campaignIds = rows.map((r) => r.id);
  } else {
    console.error("usage: tsx scripts/digest.ts (--all | --campaign <id>) [--date YYYY-MM-DD]");
    process.exit(2);
  }

  if (campaignIds.length === 0) {
    console.log(`digest: 0 campaigns with pending ads — skipping send`);
    return;
  }

  const digests = [];
  for (const id of campaignIds) {
    try {
      digests.push(await buildCampaignDigest({ campaignId: id, yesterday: date }));
    } catch (err) {
      console.error(`  campaign=${id} build error=${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (digests.length === 0) {
    console.log(`digest: all builds failed — skipping send`);
    process.exitCode = 1;
    return;
  }

  const msgId = await sendDailyDigest({ date, digests });
  console.log(`digest: sent msgId=${msgId} (${digests.length} campaigns)`);
}

main().then(() => process.exit(process.exitCode ?? 0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
