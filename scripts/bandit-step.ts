import "dotenv/config";
import { db } from "@/lib/db";
import { campaigns } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { runBanditStep } from "@/lib/bandit/step";

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

function yesterday(): string {
  const d = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

async function main() {
  const date = arg("date") ?? yesterday();
  const campaignId = arg("campaign");
  const all = process.argv.includes("--all");

  let ids: string[];
  if (campaignId) {
    ids = [campaignId];
  } else if (all) {
    const rows = await db.select({ id: campaigns.id }).from(campaigns).where(eq(campaigns.status, "active"));
    ids = rows.map((r) => r.id);
  } else {
    console.error("usage: tsx scripts/bandit-step.ts (--all | --campaign <id>) [--date YYYY-MM-DD]");
    process.exit(2);
  }

  console.log(`bandit-step: ${ids.length} campaigns for date=${date}`);
  for (const id of ids) {
    try {
      const r = await runBanditStep({ campaignId: id, date });
      console.log(`  campaign=${id} audiences=${r.audiencesProcessed} scored=${r.adsScored} paused=${r.adsPaused} fraud=${r.adsFlaggedFraud} reweighted=${r.budgetsReweighted}`);
    } catch (err) {
      console.error(`  campaign=${id} error=${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
