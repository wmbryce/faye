import { and, eq, desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { ads, audiences, assets, type Ad, AD_STATUS } from "@/lib/db/schema";

export async function listAds(opts: { campaignId?: string; audienceId?: string }): Promise<Ad[]> {
  if (!opts.campaignId && !opts.audienceId) {
    throw new Error("listAds requires campaignId or audienceId");
  }
  if (opts.campaignId && opts.audienceId) {
    return db
      .select()
      .from(ads)
      .where(and(eq(ads.campaignId, opts.campaignId), eq(ads.audienceId, opts.audienceId)))
      .orderBy(desc(ads.createdAt));
  }
  if (opts.campaignId) {
    return db.select().from(ads).where(eq(ads.campaignId, opts.campaignId)).orderBy(desc(ads.createdAt));
  }
  return db.select().from(ads).where(eq(ads.audienceId, opts.audienceId!)).orderBy(desc(ads.createdAt));
}

export async function getAd(id: string): Promise<Ad | null> {
  const [a] = await db.select().from(ads).where(eq(ads.id, id)).limit(1);
  return a ?? null;
}

export async function listPendingAdsForReview(campaignId: string) {
  return db
    .select({ ad: ads, audience: audiences, asset: assets })
    .from(ads)
    .innerJoin(audiences, eq(audiences.id, ads.audienceId))
    .innerJoin(assets, eq(assets.id, ads.assetId))
    .where(and(eq(ads.campaignId, campaignId), eq(ads.status, AD_STATUS.pending)));
}
