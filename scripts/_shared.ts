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

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Parse `--date` if present, else fall back to yesterday. Exits with code 2 on
 * malformed input so cron alerts fire instead of pulling bogus dates silently.
 */
export function dateArgOrYesterday(): string {
  const v = arg("date") ?? yesterdayISO();
  if (!ISO_DATE_RE.test(v) || Number.isNaN(Date.parse(`${v}T00:00:00Z`))) {
    console.error("usage error: --date must be a valid YYYY-MM-DD");
    process.exit(2);
  }
  return v;
}

/**
 * Resolve campaign IDs from CLI args. `--campaign <id>` returns [id]; `--all`
 * returns all active campaign IDs. Returns null if neither flag is present.
 * Exits with code 2 if both flags are passed (mutually exclusive).
 */
export async function resolveCampaignIds(): Promise<string[] | null> {
  const single = arg("campaign");
  const all = process.argv.includes("--all");
  if (single && all) {
    console.error("usage error: pass either --all or --campaign <id>, not both");
    process.exit(2);
  }
  if (single) return [single];
  if (all) {
    const rows = await db.select({ id: campaigns.id }).from(campaigns).where(eq(campaigns.status, "active"));
    return rows.map((r) => r.id);
  }
  return null;
}
