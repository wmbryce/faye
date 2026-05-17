import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { ads, audiences, campaigns, assets } from "@/lib/db/schema";
import { getArtist } from "@/lib/artists/queries";
import { getRelease } from "@/lib/releases/queries";

export type AdRejectSummary = {
  adId: string;
  artistName: string;
  releaseTitle: string;
  audienceName: string;
  assetUrl: string;
  copyHeadline: string;
  copyPrimaryText: string;
  copyBody: string;
  status: string;
  publishAt: Date | null;
};

/** Gathers everything the reject-confirm page needs in a single round-trip-ish read. */
export async function getAdRejectSummary(adId: string): Promise<AdRejectSummary | null> {
  const [row] = await db
    .select({ ad: ads, audience: audiences, campaign: campaigns, asset: assets })
    .from(ads)
    .innerJoin(audiences, eq(audiences.id, ads.audienceId))
    .innerJoin(campaigns, eq(campaigns.id, ads.campaignId))
    .innerJoin(assets, eq(assets.id, ads.assetId))
    .where(eq(ads.id, adId))
    .limit(1);
  if (!row) return null;
  const [release, artist] = await Promise.all([
    getRelease(row.campaign.releaseId),
    getArtist(row.campaign.artistId),
  ]);
  if (!release || !artist) return null;
  return {
    adId: row.ad.id,
    artistName: artist.name,
    releaseTitle: release.title,
    audienceName: row.audience.name,
    assetUrl: row.asset.url,
    copyHeadline: row.ad.copyHeadline,
    copyPrimaryText: row.ad.copyPrimaryText,
    copyBody: row.ad.copyBody,
    status: row.ad.status,
    publishAt: row.ad.publishAt,
  };
}
