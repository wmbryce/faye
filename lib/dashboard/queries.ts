import { count, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { AD_STATUS, CAMPAIGN_STATUS, ads, artists, campaigns, releases } from "@/lib/db/schema";

export type DashboardSummary = {
  artistCount: number;
  activeCampaignCount: number;
  pendingAdCount: number;
};

export async function getDashboardSummary(): Promise<DashboardSummary> {
  const [[artistRow], [campaignRow], [adRow]] = await Promise.all([
    db.select({ n: count() }).from(artists),
    db.select({ n: count() }).from(campaigns).where(eq(campaigns.status, CAMPAIGN_STATUS.active)),
    db.select({ n: count() }).from(ads).where(eq(ads.status, AD_STATUS.pending)),
  ]);
  return {
    artistCount: Number(artistRow?.n ?? 0),
    activeCampaignCount: Number(campaignRow?.n ?? 0),
    pendingAdCount: Number(adRow?.n ?? 0),
  };
}

export type PendingApprovalRow = {
  adId: string;
  copyHeadline: string;
  campaignId: string;
  artistName: string;
  releaseTitle: string;
  createdAt: Date;
};

export async function listPendingApprovals(limit = 10): Promise<PendingApprovalRow[]> {
  return db
    .select({
      adId: ads.id,
      copyHeadline: ads.copyHeadline,
      campaignId: ads.campaignId,
      artistName: artists.name,
      releaseTitle: releases.title,
      createdAt: ads.createdAt,
    })
    .from(ads)
    .innerJoin(campaigns, eq(campaigns.id, ads.campaignId))
    .innerJoin(artists, eq(artists.id, campaigns.artistId))
    .innerJoin(releases, eq(releases.id, campaigns.releaseId))
    .where(eq(ads.status, AD_STATUS.pending))
    .orderBy(desc(ads.createdAt))
    .limit(limit);
}

export type ActiveCampaignRow = {
  id: string;
  artistName: string;
  releaseTitle: string;
  startDate: string;
  endDate: string;
  dailyBudgetCents: number;
};

export async function listActiveCampaigns(limit = 10): Promise<ActiveCampaignRow[]> {
  return db
    .select({
      id: campaigns.id,
      artistName: artists.name,
      releaseTitle: releases.title,
      startDate: campaigns.startDate,
      endDate: campaigns.endDate,
      dailyBudgetCents: campaigns.dailyBudgetCents,
    })
    .from(campaigns)
    .innerJoin(artists, eq(artists.id, campaigns.artistId))
    .innerJoin(releases, eq(releases.id, campaigns.releaseId))
    .where(eq(campaigns.status, CAMPAIGN_STATUS.active))
    .orderBy(desc(campaigns.createdAt))
    .limit(limit);
}
