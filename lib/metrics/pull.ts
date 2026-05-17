import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  adMetricDaily, releaseMetricDaily, ads, campaigns, releases,
} from "@/lib/db/schema";
import { makeFBClient } from "@/lib/fb/factory";
import { makeSmartlinkClient } from "@/lib/smartlink/factory";
import { makeSpotifyClient } from "@/lib/spotify/factory";
import type { FBClient } from "@/lib/fb/client";
import type { SmartlinkClient } from "@/lib/smartlink/client";
import type { SpotifyClient } from "@/lib/spotify/client";

export type PullDailyMetricsArgs = {
  campaignId: string;
  date: string; // YYYY-MM-DD
  /** Test injection: pass in fakes here to bypass factories. */
  overrides?: {
    fb?: FBClient;
    smartlink?: SmartlinkClient;
    spotify?: SpotifyClient;
  };
};

export type PullDailyMetricsResult = {
  adsProcessed: number;
  smartlinkClicksTotal: number;
  smartlinkStreamsTotal: number | null;
  spotifyStreams: number | null;
  spotifyListeners: number | null;
  spotifySource: "s4a" | "web_estimate";
};

export async function pullDailyMetrics(args: PullDailyMetricsArgs): Promise<PullDailyMetricsResult> {
  const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, args.campaignId)).limit(1);
  if (!campaign) throw new Error("campaign not found");

  const [release] = await db.select().from(releases).where(eq(releases.id, campaign.releaseId)).limit(1);
  if (!release) throw new Error("release not found");

  const fb = args.overrides?.fb ?? (await makeFBClient());
  const sl = args.overrides?.smartlink ?? (await makeSmartlinkClient());
  const sp = args.overrides?.spotify ?? (await makeSpotifyClient({ artistId: campaign.artistId }));

  // 1. published ads
  const publishedAds = await db
    .select()
    .from(ads)
    .where(and(eq(ads.campaignId, args.campaignId), eq(ads.status, "published")));

  // 2. parallel FB insights
  const insightsByAd = new Map<string, { spendCents: number; impressions: number; linkClicks: number }>();
  await Promise.all(publishedAds.map(async (ad) => {
    if (!ad.fbAdId) return;
    const ins = await fb.getAdInsights(ad.fbAdId, args.date);
    if (ins) insightsByAd.set(ad.id, ins);
  }));

  // 3. smartlink totals (once per campaign)
  let smartlinkClicksTotal = 0;
  let smartlinkStreamsTotal: number | null = null;
  if (campaign.smartlinkId) {
    const m = await sl.getDailyMetrics({ smartlinkId: campaign.smartlinkId, date: args.date });
    smartlinkClicksTotal = m.clicks;
    smartlinkStreamsTotal = m.estimatedStreams ?? null;
  }

  // 4. apportion
  const fbClickTotal = Array.from(insightsByAd.values()).reduce((acc, x) => acc + x.linkClicks, 0);

  // 5. Spotify streams for release (once per campaign)
  const spotifyResult = await sp.getDailyStreams({
    artistId: campaign.artistId,
    trackId: release.kind === "track" ? release.spotifyId : undefined,
    date: args.date,
  });
  await db
    .insert(releaseMetricDaily)
    .values({
      releaseId: release.id,
      date: args.date,
      spotifyStreams: spotifyResult.streams,
      spotifyListeners: spotifyResult.listeners,
      source: spotifyResult.source,
    })
    .onConflictDoUpdate({
      target: [releaseMetricDaily.releaseId, releaseMetricDaily.date],
      set: {
        spotifyStreams: spotifyResult.streams,
        spotifyListeners: spotifyResult.listeners,
        source: spotifyResult.source,
      },
    });

  // 6. per-ad upsert
  for (const ad of publishedAds) {
    const ins = insightsByAd.get(ad.id) ?? { spendCents: 0, impressions: 0, linkClicks: 0 };
    const share = fbClickTotal > 0
      ? ins.linkClicks / fbClickTotal
      : publishedAds.length > 0 ? 1 / publishedAds.length : 0;
    const smartlinkClicks = Math.round(smartlinkClicksTotal * share);
    const smartlinkStreams = smartlinkStreamsTotal != null
      ? Math.round(smartlinkStreamsTotal * share)
      : null;

    await db
      .insert(adMetricDaily)
      .values({
        adId: ad.id,
        date: args.date,
        spendCents: ins.spendCents,
        impressions: ins.impressions,
        fbLinkClicks: ins.linkClicks,
        smartlinkClicks,
        smartlinkStreams,
      })
      .onConflictDoUpdate({
        target: [adMetricDaily.adId, adMetricDaily.date],
        set: {
          spendCents: ins.spendCents,
          impressions: ins.impressions,
          fbLinkClicks: ins.linkClicks,
          smartlinkClicks,
          smartlinkStreams,
        },
      });
  }

  return {
    adsProcessed: publishedAds.length,
    smartlinkClicksTotal,
    smartlinkStreamsTotal,
    spotifyStreams: spotifyResult.streams,
    spotifyListeners: spotifyResult.listeners,
    spotifySource: spotifyResult.source,
  };
}
