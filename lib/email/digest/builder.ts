import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { ads, audiences, campaigns, assets, adMetricDaily, releaseMetricDaily, AD_STATUS } from "@/lib/db/schema";
import { makeRejectToken } from "@/lib/email/reject-tokens";
import { env } from "@/lib/env";
import { computeReleaseBaseline } from "@/lib/metrics/queries";
import { getArtist } from "@/lib/artists/queries";
import { getRelease } from "@/lib/releases/queries";

export type PendingAdSummary = {
  adId: string;
  audienceName: string;
  assetUrl: string;
  copyHeadline: string;
  copyPrimaryText: string;
  rejectUrl: string;
  publishAt: Date;
};

export type CampaignDigest = {
  campaignId: string;
  campaignName: string;
  artistName: string;
  releaseTitle: string;
  yesterday: {
    spendCents: number;
    impressions: number;
    fbLinkClicks: number;
    smartlinkClicks: number;
    smartlinkStreams: number | null;
    spotifyStreams: number | null;
    spotifyStreamDelta: number | null;
    composite: number | null;
    degraded: boolean;
  };
  pendingAds: PendingAdSummary[];
};

export async function buildCampaignDigest(args: {
  campaignId: string;
  yesterday: string;
}): Promise<CampaignDigest> {
  const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, args.campaignId)).limit(1);
  if (!campaign) throw new Error("campaign not found");

  const [artist, release] = await Promise.all([
    getArtist(campaign.artistId),
    getRelease(campaign.releaseId),
  ]);
  if (!artist || !release) throw new Error("artist or release missing");

  const [metricRows, [rm], baseline] = await Promise.all([
    db
      .select({ metric: adMetricDaily })
      .from(adMetricDaily)
      .innerJoin(ads, eq(ads.id, adMetricDaily.adId))
      .where(and(eq(ads.campaignId, args.campaignId), eq(adMetricDaily.date, args.yesterday))),
    db
      .select()
      .from(releaseMetricDaily)
      .where(and(eq(releaseMetricDaily.releaseId, release.id), eq(releaseMetricDaily.date, args.yesterday)))
      .limit(1),
    computeReleaseBaseline(release.id, campaign.startDate),
  ]);

  let spendCents = 0, impressions = 0, fbLinkClicks = 0, smartlinkClicks = 0;
  let smartlinkStreams: number | null = null;
  const compositeScores: number[] = [];
  let smartlinkStreamsAny = false;
  for (const { metric: m } of metricRows) {
    spendCents += m.spendCents;
    impressions += m.impressions;
    fbLinkClicks += m.fbLinkClicks;
    smartlinkClicks += m.smartlinkClicks;
    if (m.smartlinkStreams != null) {
      smartlinkStreamsAny = true;
      smartlinkStreams = (smartlinkStreams ?? 0) + m.smartlinkStreams;
    }
    if (m.compositeScore != null) compositeScores.push(m.compositeScore);
  }
  if (!smartlinkStreamsAny) smartlinkStreams = null;
  const composite =
    compositeScores.length === 0
      ? null
      : compositeScores.reduce((a, b) => a + b, 0) / compositeScores.length;
  const spotifyStreams = rm?.spotifyStreams ?? null;
  const spotifyStreamDelta = spotifyStreams != null ? spotifyStreams - baseline : null;
  const degraded = rm?.source ? rm.source !== "s4a" : true;

  const pendingRows = await db
    .select({ ad: ads, audience: audiences })
    .from(ads)
    .innerJoin(audiences, eq(audiences.id, ads.audienceId))
    .where(and(eq(ads.campaignId, args.campaignId), eq(ads.status, AD_STATUS.pending)));

  const assetIds = [...new Set(pendingRows.map((p) => p.ad.assetId))];
  const assetRows =
    assetIds.length > 0
      ? await db.select().from(assets).where(inArray(assets.id, assetIds))
      : [];
  const assetUrlById = new Map(assetRows.map((a) => [a.id, a.url]));

  const pendingAds: PendingAdSummary[] = await Promise.all(
    pendingRows.map(async ({ ad, audience }) => {
      const token = await makeRejectToken(ad.id);
      return {
        adId: ad.id,
        audienceName: audience.name,
        assetUrl: `${env().APP_URL}${assetUrlById.get(ad.assetId) ?? ""}`,
        copyHeadline: ad.copyHeadline,
        copyPrimaryText: ad.copyPrimaryText,
        rejectUrl: `${env().APP_URL}/reject/${encodeURIComponent(token)}`,
        publishAt: ad.publishAt ?? new Date(),
      };
    }),
  );

  return {
    campaignId: campaign.id,
    campaignName: `${artist.name} — ${release.title}`,
    artistName: artist.name,
    releaseTitle: release.title,
    yesterday: {
      spendCents,
      impressions,
      fbLinkClicks,
      smartlinkClicks,
      smartlinkStreams,
      spotifyStreams,
      spotifyStreamDelta,
      composite,
      degraded,
    },
    pendingAds,
  };
}
