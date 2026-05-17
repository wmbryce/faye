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

/**
 * Largest-remainder apportionment: distribute `total` across N positions in
 * proportion to `shares` so per-position integers sum exactly to `total`.
 * Shares need not be normalized; only their relative magnitudes matter.
 */
function apportion(total: number, shares: number[]): number[] {
  const n = shares.length;
  if (n === 0) return [];
  const sumShares = shares.reduce((a, b) => a + b, 0);
  if (sumShares <= 0) return new Array(n).fill(0);
  const raw = shares.map((s) => (total * s) / sumShares);
  const floors = raw.map((x) => Math.floor(x));
  let remainder = total - floors.reduce((a, b) => a + b, 0);
  if (remainder <= 0) return floors;
  // distribute remainder by largest fractional parts, ties broken by index
  const order = raw
    .map((x, i) => ({ i, frac: x - Math.floor(x) }))
    .sort((a, b) => (b.frac - a.frac) || (a.i - b.i));
  for (const { i } of order) {
    if (remainder === 0) break;
    floors[i] += 1;
    remainder--;
  }
  return floors;
}

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

  // 3+5. smartlink + Spotify in parallel (both are once-per-campaign, independent)
  const [smartlinkM, spotifyResult] = await Promise.all([
    campaign.smartlinkId
      ? sl.getDailyMetrics({ smartlinkId: campaign.smartlinkId, date: args.date })
      : Promise.resolve({ smartlinkId: "", date: args.date, clicks: 0, spotifyClicks: 0, estimatedStreams: null as number | null }),
    sp.getDailyStreams({
      artistId: campaign.artistId,
      trackId: release.kind === "track" ? release.spotifyId : undefined,
      date: args.date,
    }),
  ]);
  const smartlinkClicksTotal = smartlinkM.clicks;
  const smartlinkStreamsTotal: number | null = smartlinkM.estimatedStreams ?? null;

  // 4. compute per-ad shares + apportion totals using largest-remainder so per-ad
  // sums equal the campaign totals (Math.round per row drifts).
  const fbClickTotal = Array.from(insightsByAd.values()).reduce((acc, x) => acc + x.linkClicks, 0);
  const shares = publishedAds.map((ad) => {
    const ins = insightsByAd.get(ad.id) ?? { spendCents: 0, impressions: 0, linkClicks: 0 };
    if (fbClickTotal > 0) return ins.linkClicks / fbClickTotal;
    return publishedAds.length > 0 ? 1 / publishedAds.length : 0;
  });
  const smartlinkClicksPerAd = apportion(smartlinkClicksTotal, shares);
  const smartlinkStreamsPerAd = smartlinkStreamsTotal != null
    ? apportion(smartlinkStreamsTotal, shares)
    : null;

  // 5. write release + per-ad rows inside a transaction so a per-ad failure
  // rolls back the whole daily snapshot.
  await db.transaction(async (tx) => {
    await tx
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

    for (let i = 0; i < publishedAds.length; i++) {
      const ad = publishedAds[i];
      const ins = insightsByAd.get(ad.id) ?? { spendCents: 0, impressions: 0, linkClicks: 0 };
      const smartlinkClicks = smartlinkClicksPerAd[i];
      const smartlinkStreams = smartlinkStreamsPerAd ? smartlinkStreamsPerAd[i] : null;

      await tx
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
  });

  return {
    adsProcessed: publishedAds.length,
    smartlinkClicksTotal,
    smartlinkStreamsTotal,
    spotifyStreams: spotifyResult.streams,
    spotifyListeners: spotifyResult.listeners,
    spotifySource: spotifyResult.source,
  };
}
