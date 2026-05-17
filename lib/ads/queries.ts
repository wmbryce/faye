import { and, eq, desc, isNotNull, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { ads, audiences, assets, adMetricDaily, type Ad, AD_STATUS } from "@/lib/db/schema";

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

export type AdRowSummary = {
  ad: {
    id: string;
    copyHeadline: string;
    copyPrimaryText: string;
    status: string;
    generation: number;
    fbAdId: string | null;
    parentAdId: string | null;
  };
  audienceName: string;
  lifetimeSpendCents: number;
  lifetimeImpressions: number;
  lifetimeFbClicks: number;
  lifetimeSmartlinkClicks: number;
  lifetimeStreams: number | null;
  latestComposite: number | null;
};

export async function listAdsRichForCampaign(campaignId: string): Promise<AdRowSummary[]> {
  const rows = await db
    .select({
      ad: ads,
      audienceName: audiences.name,
      lifetimeSpendCents: sql<number>`coalesce(sum(${adMetricDaily.spendCents}), 0)::int`,
      lifetimeImpressions: sql<number>`coalesce(sum(${adMetricDaily.impressions}), 0)::int`,
      lifetimeFbClicks: sql<number>`coalesce(sum(${adMetricDaily.fbLinkClicks}), 0)::int`,
      lifetimeSmartlinkClicks: sql<number>`coalesce(sum(${adMetricDaily.smartlinkClicks}), 0)::int`,
      lifetimeStreams: sql<number | null>`sum(${adMetricDaily.smartlinkStreams})::int`,
    })
    .from(ads)
    .innerJoin(audiences, eq(audiences.id, ads.audienceId))
    .leftJoin(adMetricDaily, eq(adMetricDaily.adId, ads.id))
    .where(eq(ads.campaignId, campaignId))
    .groupBy(ads.id, audiences.name)
    .orderBy(desc(ads.createdAt));

  // Latest composite per ad: separate query, scoped to this campaign's ads
  const campaignAdIds = rows.map((r) => r.ad.id);
  const latestComp = campaignAdIds.length === 0
    ? []
    : await db
        .select({ adId: adMetricDaily.adId, compositeScore: adMetricDaily.compositeScore })
        .from(adMetricDaily)
        .where(and(isNotNull(adMetricDaily.compositeScore), inArray(adMetricDaily.adId, campaignAdIds)))
        .orderBy(desc(adMetricDaily.date));
  const latestByAd = new Map<string, number>();
  for (const r of latestComp) {
    if (r.compositeScore != null && !latestByAd.has(r.adId)) latestByAd.set(r.adId, r.compositeScore);
  }

  const withComposite = rows.map((r) => ({
    ad: {
      id: r.ad.id,
      copyHeadline: r.ad.copyHeadline,
      copyPrimaryText: r.ad.copyPrimaryText,
      status: r.ad.status,
      generation: r.ad.generation,
      fbAdId: r.ad.fbAdId,
      parentAdId: r.ad.parentAdId,
    },
    audienceName: r.audienceName,
    lifetimeSpendCents: r.lifetimeSpendCents,
    lifetimeImpressions: r.lifetimeImpressions,
    lifetimeFbClicks: r.lifetimeFbClicks,
    lifetimeSmartlinkClicks: r.lifetimeSmartlinkClicks,
    lifetimeStreams: r.lifetimeStreams,
    latestComposite: latestByAd.get(r.ad.id) ?? null,
  }));

  // Sort by composite desc (nulls last), then createdAt desc (already that order from query)
  return withComposite.sort((a, b) => {
    if (a.latestComposite == null && b.latestComposite == null) return 0;
    if (a.latestComposite == null) return 1;
    if (b.latestComposite == null) return -1;
    return b.latestComposite - a.latestComposite;
  });
}
