import { and, eq, lte } from "drizzle-orm";
import { db } from "@/lib/db";
import { ads } from "@/lib/db/schema";
import { publishAd } from "@/lib/ads/mutations";

export type PublisherTickResult = {
  attempted: number;
  published: number;
  errors: { adId: string; error: string }[];
};

/**
 * Publishes all ads in status `pending` whose publishAt has elapsed.
 * Safe to run on a 5-min cron — uses publishAd() which is idempotent against
 * its own status guard (refuses to publish anything not `draft`/`pending`).
 */
export async function publisherTick(now: Date = new Date()): Promise<PublisherTickResult> {
  const candidates = await db
    .select({ id: ads.id })
    .from(ads)
    .where(and(eq(ads.status, "pending"), lte(ads.publishAt, now)));

  const errors: { adId: string; error: string }[] = [];
  let published = 0;
  for (const { id } of candidates) {
    try {
      await publishAd(id);
      published++;
    } catch (err) {
      errors.push({ adId: id, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return { attempted: candidates.length, published, errors };
}
