import { describe, it, expect } from "vitest";
import { db } from "@/lib/db";
import { artists, releases, audienceSeeds, assets, ads, adMetricDaily, releaseMetricDaily } from "@/lib/db/schema";
import { setSecret } from "@/lib/secrets/mutations";
import { createCampaign } from "@/lib/campaigns/mutations";
import { listAudiencesForCampaign } from "@/lib/campaigns/queries";
import { createDraftAd, publishAd } from "@/lib/ads/mutations";
import { pullDailyMetrics } from "@/lib/metrics/pull";
import { eq } from "drizzle-orm";
import type { FBClient } from "@/lib/fb/client";
import type { SmartlinkClient } from "@/lib/smartlink/client";
import type { SpotifyClient } from "@/lib/spotify/client";

async function seedCampaignWithPublishedAds() {
  const [a] = await db.insert(artists).values({ name: "A", spotifyArtistId: "p5_pull_s", timezone: "UTC" }).returning();
  const [r] = await db.insert(releases).values({
    artistId: a.id, kind: "track", spotifyId: "p5_pull_t", title: "T", releaseDate: "2026-06-01",
  }).returning();
  const [seed] = await db.insert(audienceSeeds).values({
    artistId: a.id, name: "x", targetingSpec: { geo: { countries: ["US"] } },
  }).returning();
  const [asset] = await db.insert(assets).values({
    artistId: a.id, kind: "image", url: "/api/uploads/x.png", bytes: 1, contentType: "image/png",
  }).returning();
  await setSecret("fb.ad_account_id", "act_99");
  await setSecret("fb.page_id", "p");
  const c = await createCampaign({
    artistId: a.id, releaseId: r.id, dailyBudgetCents: 1000,
    startDate: "2026-06-01", endDate: "2026-07-01",
    audienceSeedIds: [seed.id], spotifyTrackOrAlbumUrl: "https://open.spotify.com/track/abc",
  });
  const [aud] = await listAudiencesForCampaign(c.id);
  const ad1 = await createDraftAd({
    campaignId: c.id, audienceId: aud.id, assetId: asset.id,
    copyHeadline: "h1", copyPrimaryText: "p1", copyBody: "",
  });
  const ad2 = await createDraftAd({
    campaignId: c.id, audienceId: aud.id, assetId: asset.id,
    copyHeadline: "h2", copyPrimaryText: "p2", copyBody: "",
  });
  await publishAd(ad1.id);
  await publishAd(ad2.id);
  return { campaign: c, release: r, ad1, ad2, audience: aud };
}

const DATE = "2026-06-02";

function stubFB(byAd: Record<string, { spendCents: number; impressions: number; linkClicks: number; ctr: number; cpc: number }>): FBClient {
  return {
    async createCampaign() { return { id: "x" }; },
    async createAdSet()     { return { id: "x" }; },
    async createAdCreative() { return { id: "x" }; },
    async createAd()         { return { id: "x" }; },
    async pauseAd() {},
    async archiveAd() {},
    async setAdSetDailyBudget() {},
    async pauseAdSet() {},
    async resumeAdSet() {},
    async getAdInsights(adId) { return byAd[adId] ?? null; },
  };
}

function stubSmartlink(metrics: { clicks: number; spotifyClicks: number; estimatedStreams: number | null }): SmartlinkClient {
  return {
    async create() { return { id: "sl", shortUrl: "https://ffm.to/sl" }; },
    async getDailyMetrics({ smartlinkId, date }) {
      return { smartlinkId, date, ...metrics };
    },
  };
}

function stubSpotify(daily: { streams: number | null; listeners: number | null; source: "s4a" | "web_estimate" }): SpotifyClient {
  return {
    async getArtistPopularity() { return { popularity: 0, followers: 0 }; },
    async getTrack() { return { id: "x", title: "x", popularity: 0 }; },
    async getDailyStreams() { return daily; },
  };
}

describe("pullDailyMetrics", () => {
  it("apportions smartlink clicks/streams by FB-click share", async () => {
    const { campaign, ad1, ad2 } = await seedCampaignWithPublishedAds();
    // The test mock assigns fbAdIds via sequential counter per factory call.
    // Force distinct fbAdIds so we can stub per-ad insights.
    const FB_AD_ID_1 = "test_fb_ad_1";
    const FB_AD_ID_2 = "test_fb_ad_2";
    await db.update(ads).set({ fbAdId: FB_AD_ID_1 }).where(eq(ads.id, ad1.id));
    await db.update(ads).set({ fbAdId: FB_AD_ID_2 }).where(eq(ads.id, ad2.id));

    const insByFbAdId: Record<string, { spendCents: number; impressions: number; linkClicks: number; ctr: number; cpc: number }> = {
      [FB_AD_ID_1]: { spendCents: 300, impressions: 1000, linkClicks: 30, ctr: 0.03, cpc: 10 },
      [FB_AD_ID_2]: { spendCents: 700, impressions: 1000, linkClicks: 70, ctr: 0.07, cpc: 10 },
    };
    const result = await pullDailyMetrics({
      campaignId: campaign.id,
      date: DATE,
      overrides: {
        fb: stubFB(insByFbAdId),
        smartlink: stubSmartlink({ clicks: 100, spotifyClicks: 80, estimatedStreams: 20 }),
        spotify: stubSpotify({ streams: 500, listeners: 100, source: "s4a" }),
      },
    });
    expect(result.adsProcessed).toBe(2);
    expect(result.smartlinkClicksTotal).toBe(100);
    expect(result.smartlinkStreamsTotal).toBe(20);

    const rows = await db.select().from(adMetricDaily).where(eq(adMetricDaily.date, DATE));
    expect(rows).toHaveLength(2);
    const byAdId = new Map(rows.map((r) => [r.adId, r]));
    expect(byAdId.get(ad1.id)?.spendCents).toBe(300);
    expect(byAdId.get(ad1.id)?.smartlinkClicks).toBe(30); // 100 * 30/100
    expect(byAdId.get(ad1.id)?.smartlinkStreams).toBe(6);  // 20 * 30/100 = 6
    expect(byAdId.get(ad2.id)?.smartlinkClicks).toBe(70);
    expect(byAdId.get(ad2.id)?.smartlinkStreams).toBe(14);

    const [rm] = await db.select().from(releaseMetricDaily);
    expect(rm.spotifyStreams).toBe(500);
    expect(rm.source).toBe("s4a");
  });

  it("apportions equally when all ads have zero clicks", async () => {
    const { campaign, ad1, ad2 } = await seedCampaignWithPublishedAds();
    const FB_AD_ID_1 = "test_fb_ad_3";
    const FB_AD_ID_2 = "test_fb_ad_4";
    await db.update(ads).set({ fbAdId: FB_AD_ID_1 }).where(eq(ads.id, ad1.id));
    await db.update(ads).set({ fbAdId: FB_AD_ID_2 }).where(eq(ads.id, ad2.id));
    const fb = stubFB({
      [FB_AD_ID_1]: { spendCents: 100, impressions: 1000, linkClicks: 0, ctr: 0, cpc: 0 },
      [FB_AD_ID_2]: { spendCents: 100, impressions: 1000, linkClicks: 0, ctr: 0, cpc: 0 },
    });
    await pullDailyMetrics({
      campaignId: campaign.id,
      date: DATE,
      overrides: {
        fb,
        smartlink: stubSmartlink({ clicks: 10, spotifyClicks: 8, estimatedStreams: 4 }),
        spotify: stubSpotify({ streams: null, listeners: null, source: "web_estimate" }),
      },
    });
    const rows = await db.select().from(adMetricDaily).where(eq(adMetricDaily.date, DATE));
    expect(rows).toHaveLength(2);
    const byAd = new Map(rows.map((r) => [r.adId, r]));
    expect(byAd.get(ad1.id)?.smartlinkClicks).toBe(5);
    expect(byAd.get(ad2.id)?.smartlinkClicks).toBe(5);
    expect(byAd.get(ad1.id)?.smartlinkStreams).toBe(2);
    expect(byAd.get(ad2.id)?.smartlinkStreams).toBe(2);
  });

  it("preserves null streams when both signals unavailable", async () => {
    const { campaign, ad1 } = await seedCampaignWithPublishedAds();
    const FB_AD_ID = "test_fb_ad_5";
    await db.update(ads).set({ fbAdId: FB_AD_ID }).where(eq(ads.id, ad1.id));
    await pullDailyMetrics({
      campaignId: campaign.id,
      date: DATE,
      overrides: {
        fb: stubFB({ [FB_AD_ID]: { spendCents: 100, impressions: 100, linkClicks: 1, ctr: 0.01, cpc: 100 } }),
        smartlink: stubSmartlink({ clicks: 0, spotifyClicks: 0, estimatedStreams: null }),
        spotify: stubSpotify({ streams: null, listeners: null, source: "web_estimate" }),
      },
    });
    const rows = await db.select().from(adMetricDaily).where(eq(adMetricDaily.date, DATE));
    expect(rows.find((r) => r.adId === ad1.id)?.smartlinkStreams).toBeNull();
    const [rm] = await db.select().from(releaseMetricDaily);
    expect(rm.spotifyStreams).toBeNull();
    expect(rm.source).toBe("web_estimate");
  });

  it("re-running upserts (no duplicate-key error)", async () => {
    const { campaign, ad1 } = await seedCampaignWithPublishedAds();
    const FB_AD_ID = "test_fb_ad_6";
    await db.update(ads).set({ fbAdId: FB_AD_ID }).where(eq(ads.id, ad1.id));
    const overrides = {
      fb: stubFB({ [FB_AD_ID]: { spendCents: 100, impressions: 100, linkClicks: 1, ctr: 0.01, cpc: 100 } }),
      smartlink: stubSmartlink({ clicks: 1, spotifyClicks: 1, estimatedStreams: 0 }),
      spotify: stubSpotify({ streams: 10, listeners: 5, source: "s4a" as const }),
    };
    await pullDailyMetrics({ campaignId: campaign.id, date: DATE, overrides });
    await pullDailyMetrics({ campaignId: campaign.id, date: DATE, overrides });
    const rows = await db.select().from(adMetricDaily).where(eq(adMetricDaily.date, DATE));
    expect(rows.filter((r) => r.adId === ad1.id)).toHaveLength(1);  // upserted, not duplicated
  });
});
