import { eq, desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { ads, type Ad } from "@/lib/db/schema";

export async function listAds(opts: { campaignId?: string; audienceId?: string }): Promise<Ad[]> {
  if (opts.campaignId) {
    return db.select().from(ads).where(eq(ads.campaignId, opts.campaignId)).orderBy(desc(ads.createdAt));
  }
  if (opts.audienceId) {
    return db.select().from(ads).where(eq(ads.audienceId, opts.audienceId)).orderBy(desc(ads.createdAt));
  }
  return [];
}

export async function getAd(id: string): Promise<Ad | null> {
  const [a] = await db.select().from(ads).where(eq(ads.id, id)).limit(1);
  return a ?? null;
}
