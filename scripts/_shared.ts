import { db } from "@/lib/db";
import { campaigns } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

/** Read `--name=value` or `--name value` from process.argv. */
export function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const found = process.argv.find((a) => a.startsWith(prefix));
  if (found) return found.slice(prefix.length);
  const flat = process.argv.indexOf(`--${name}`);
  if (flat >= 0 && process.argv[flat + 1] && !process.argv[flat + 1].startsWith("--")) {
    return process.argv[flat + 1];
  }
  return undefined;
}

/** Yesterday's date in YYYY-MM-DD form (UTC). */
export function yesterdayISO(): string {
  return new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * Resolve campaign IDs from CLI args. `--campaign <id>` returns [id]; `--all`
 * returns all active campaign IDs. Returns null if neither flag is present.
 */
export async function resolveCampaignIds(): Promise<string[] | null> {
  const single = arg("campaign");
  if (single) return [single];
  if (process.argv.includes("--all")) {
    const rows = await db.select({ id: campaigns.id }).from(campaigns).where(eq(campaigns.status, "active"));
    return rows.map((r) => r.id);
  }
  return null;
}
