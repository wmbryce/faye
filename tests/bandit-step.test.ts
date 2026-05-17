import { describe, it, expect } from "vitest";
import { db } from "@/lib/db";
import {
  artists, releases, audienceSeeds, assets, campaigns, audiences, ads, adMetricDaily, auditLog,
} from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { setSecret } from "@/lib/secrets/mutations";
import { createCampaign } from "@/lib/campaigns/mutations";
import { listAudiencesForCampaign } from "@/lib/campaigns/queries";
import { createDraftAd, publishAd } from "@/lib/ads/mutations";
import { runBanditStep } from "@/lib/bandit/step";
import { MIN_IMPRESSIONS } from "@/lib/composite/score";
import type { FBClient } from "@/lib/fb/client";

// ---------------------------------------------------------------------------
// Stub FB client that records calls
// ---------------------------------------------------------------------------
function recordingFB(): { client: FBClient; calls: { pauseAd: string[]; setBudget: [string, number][] } } {
  const calls = { pauseAd: [] as string[], setBudget: [] as [string, number][] };
  const client: FBClient = {
    async createCampaign() { return { id: "x" }; },
    async createAdSet() { return { id: "x" }; },
    async createAdCreative() { return { id: "x" }; },
    async createAd() { return { id: "x" }; },
    async pauseAd(id) { calls.pauseAd.push(id); },
    async archiveAd() {},
    async setAdSetDailyBudget(id, c) { calls.setBudget.push([id, c]); },
    async pauseAdSet() {},
    async resumeAdSet() {},
    async getAdInsights() { return null; },
  };
  return { client, calls };
}

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------
const DATE = "2026-06-10";

async function seedBase() {
  const [artist] = await db.insert(artists).values({ name: "BanditArtist", spotifyArtistId: "bs_step_a", timezone: "UTC" }).returning();
  const [release] = await db.insert(releases).values({
    artistId: artist.id, kind: "track", spotifyId: "bs_step_r", title: "StepTrack", releaseDate: "2026-05-01",
  }).returning();
  const [seed] = await db.insert(audienceSeeds).values({
    artistId: artist.id, name: "Fans", targetingSpec: { geo: { countries: ["US"] } },
  }).returning();
  const [asset] = await db.insert(assets).values({
    artistId: artist.id, kind: "image", url: "/api/uploads/bs.png", bytes: 1, contentType: "image/png",
  }).returning();
  await setSecret("fb.ad_account_id", "act_step");
  await setSecret("fb.page_id", "pg_step");
  return { artist, release, seed, asset };
}

async function seedCampaign(seedIds: string[], releaseId: string, artistId: string) {
  return createCampaign({
    artistId,
    releaseId,
    dailyBudgetCents: 10000,
    startDate: "2026-06-01",
    endDate: "2026-07-01",
    audienceSeedIds: seedIds,
    spotifyTrackOrAlbumUrl: "https://open.spotify.com/track/bs_step",
  });
}

/** Insert an ad_metric_daily row directly (bypasses pullDailyMetrics). */
async function insertMetric(adId: string, opts: {
  spendCents?: number;
  impressions?: number;
  fbLinkClicks?: number;
  smartlinkClicks?: number;
  smartlinkStreams?: number | null;
}) {
  await db.insert(adMetricDaily).values({
    adId,
    date: DATE,
    spendCents: opts.spendCents ?? 500,
    impressions: opts.impressions ?? MIN_IMPRESSIONS + 100,
    fbLinkClicks: opts.fbLinkClicks ?? 10,
    smartlinkClicks: opts.smartlinkClicks ?? 5,
    smartlinkStreams: opts.smartlinkStreams ?? null,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("runBanditStep", () => {
  it("top-K kept, rest paused: 5 ads, K=3 → 2 paused, 3 published", async () => {
    const { artist, release, seed, asset } = await seedBase();
    const campaign = await seedCampaign([seed.id], release.id, artist.id);
    const [aud] = await listAudiencesForCampaign(campaign.id);

    // Publish 5 ads with distinct CPCs: lower spend → better score
    const adIds: string[] = [];
    for (let i = 0; i < 5; i++) {
      const draft = await createDraftAd({
        campaignId: campaign.id, audienceId: aud.id, assetId: asset.id,
        copyHeadline: `H${i}`, copyPrimaryText: `P${i}`, copyBody: "",
      });
      await publishAd(draft.id);
      await db.update(ads).set({ fbAdId: `test_step_fb_${i}` }).where(eq(ads.id, draft.id));
      adIds.push(draft.id);
    }

    // Distinct spend values → distinct CPCs (same clicks=10 each)
    const spends = [100, 200, 300, 400, 500];
    for (let i = 0; i < 5; i++) {
      await insertMetric(adIds[i], { spendCents: spends[i], impressions: 600, fbLinkClicks: 10 });
    }

    const { client, calls } = recordingFB();
    const result = await runBanditStep({ campaignId: campaign.id, date: DATE, overrides: { fb: client } });

    expect(result.audiencesProcessed).toBe(1);
    expect(result.adsScored).toBe(5);
    expect(result.adsPaused).toBe(2);
    expect(result.adsFlaggedFraud).toBe(0);

    // 2 worst ads (highest spend → worst CPC) should be paused
    const allAds = await db.select().from(ads).where(eq(ads.campaignId, campaign.id));
    const statusById = new Map(allAds.map((a) => [a.id, a.status]));
    // top 3 by score (lowest spend) → published; bottom 2 → paused
    const sortedBySpend = [...adIds].sort((a, b) => spends[adIds.indexOf(a)] - spends[adIds.indexOf(b)]);
    for (let i = 0; i < 3; i++) expect(statusById.get(sortedBySpend[i])).toBe("published");
    for (let i = 3; i < 5; i++) expect(statusById.get(sortedBySpend[i])).toBe("paused");

    // fb.pauseAd called for the 2 paused ads
    expect(calls.pauseAd).toHaveLength(2);

    // audit rows written for paused ads
    const auditRows = await db.select().from(auditLog).where(eq(auditLog.event, "paused_by_bandit"));
    expect(auditRows).toHaveLength(2);
  });

  it("fraud-flagged ads paused independently of K and metric row marked fraud_suspected", async () => {
    const { artist, release, seed, asset } = await seedBase();
    const campaign = await seedCampaign([seed.id], release.id, artist.id);
    const [aud] = await listAudiencesForCampaign(campaign.id);

    const adIds: string[] = [];
    for (let i = 0; i < 3; i++) {
      const draft = await createDraftAd({
        campaignId: campaign.id, audienceId: aud.id, assetId: asset.id,
        copyHeadline: `Hf${i}`, copyPrimaryText: `Pf${i}`, copyBody: "",
      });
      await publishAd(draft.id);
      await db.update(ads).set({ fbAdId: `test_fraud_fb_${i}` }).where(eq(ads.id, draft.id));
      adIds.push(draft.id);
    }

    // ads[0] and ads[1] → normal metrics (good CTR, reasonable spend)
    await insertMetric(adIds[0], { spendCents: 500, impressions: 600, fbLinkClicks: 10, smartlinkStreams: 5 });
    await insertMetric(adIds[1], { spendCents: 600, impressions: 600, fbLinkClicks: 10, smartlinkStreams: 3 });
    // ads[2] → fraud: CTR > 10%, CPC < 5 cents, no streams
    // ctr = 200/1000 = 0.2, cpc = 4/200 = 0.02 cents... but spendCents is integer cents
    // fraud: ctr > 0.10, cpcCents < 5, noStreams
    // impressions=1000, fbLinkClicks=200 → ctr=0.2; spendCents=400, cpc=2 cents; no streams
    await insertMetric(adIds[2], { spendCents: 400, impressions: 1000, fbLinkClicks: 200, smartlinkStreams: 0 });

    const { client, calls } = recordingFB();
    const result = await runBanditStep({ campaignId: campaign.id, date: DATE, overrides: { fb: client } });

    expect(result.adsFlaggedFraud).toBe(1);

    // fraud metric row should have excludedReason='fraud_suspected'
    const [fraudMetric] = await db.select().from(adMetricDaily).where(eq(adMetricDaily.adId, adIds[2]));
    expect(fraudMetric.excludedReason).toBe("fraud_suspected");

    // fraud ad should be paused
    const [fraudAd] = await db.select().from(ads).where(eq(ads.id, adIds[2]));
    expect(fraudAd.status).toBe("paused");
    expect(calls.pauseAd).toContain("test_fraud_fb_2");
  });

  it("low-impressions ads kept_exploring (status stays published)", async () => {
    const { artist, release, seed, asset } = await seedBase();
    const campaign = await seedCampaign([seed.id], release.id, artist.id);
    const [aud] = await listAudiencesForCampaign(campaign.id);

    // 2 ads: one with enough impressions, one below threshold
    const adIds: string[] = [];
    for (let i = 0; i < 2; i++) {
      const draft = await createDraftAd({
        campaignId: campaign.id, audienceId: aud.id, assetId: asset.id,
        copyHeadline: `Hl${i}`, copyPrimaryText: `Pl${i}`, copyBody: "",
      });
      await publishAd(draft.id);
      adIds.push(draft.id);
    }

    // ad[0] well above threshold
    await insertMetric(adIds[0], { spendCents: 500, impressions: MIN_IMPRESSIONS + 100, fbLinkClicks: 10 });
    // ad[1] below threshold → low_impressions
    await insertMetric(adIds[1], { spendCents: 100, impressions: MIN_IMPRESSIONS - 1, fbLinkClicks: 2 });

    const { client, calls } = recordingFB();
    const result = await runBanditStep({ campaignId: campaign.id, date: DATE, overrides: { fb: client } });

    // low-impressions ad stays published
    const [lowAd] = await db.select().from(ads).where(eq(ads.id, adIds[1]));
    expect(lowAd.status).toBe("published");

    // its metric row should have excludedReason=low_impressions
    const [lowMetric] = await db.select().from(adMetricDaily).where(eq(adMetricDaily.adId, adIds[1]));
    expect(lowMetric.excludedReason).toBe("low_impressions");

    // no pause calls for the low-impressions ad
    expect(result.adsPaused).toBe(0);
    expect(calls.pauseAd).toHaveLength(0);
  });

  it("audience budget reweighted toward higher-scoring audience within ±20% cap", async () => {
    const { artist, release, asset } = await seedBase();
    // Two seeds → two audiences
    const seedRows = await db.select().from(audienceSeeds).where(eq(audienceSeeds.artistId, artist.id));
    const [seed2] = await db.insert(audienceSeeds).values({
      artistId: artist.id, name: "Lookalike", targetingSpec: { geo: { countries: ["CA"] } },
    }).returning();
    const seed1 = seedRows[0];

    const campaign = await seedCampaign([seed1.id, seed2.id], release.id, artist.id);
    const auds = await listAudiencesForCampaign(campaign.id);
    expect(auds).toHaveLength(2);

    const aud1 = auds[0];
    const aud2 = auds[1];

    // Skew initial budgets so reweigh toward equal produces measurable change.
    // aud1 starts small (2000), aud2 starts large (8000). With equal mean scores,
    // the algorithm nudges both toward 5000/5000 (capped at ±20% of current share).
    await db.update(audiences).set({ dailyBudgetCents: 2000 }).where(eq(audiences.id, aud1.id));
    await db.update(audiences).set({ dailyBudgetCents: 8000 }).where(eq(audiences.id, aud2.id));

    // 3 ads per audience with sufficient impressions; identical metrics per audience
    // → rank-normalize within audience → mean ≈ 0 for each, equal means → algo equalises budgets
    for (let i = 0; i < 3; i++) {
      const d1 = await createDraftAd({
        campaignId: campaign.id, audienceId: aud1.id, assetId: asset.id,
        copyHeadline: `A1H${i}`, copyPrimaryText: `A1P${i}`, copyBody: "",
      });
      await publishAd(d1.id);
      await insertMetric(d1.id, { spendCents: 100 + i * 10, impressions: 600, fbLinkClicks: 10 });

      const d2 = await createDraftAd({
        campaignId: campaign.id, audienceId: aud2.id, assetId: asset.id,
        copyHeadline: `A2H${i}`, copyPrimaryText: `A2P${i}`, copyBody: "",
      });
      await publishAd(d2.id);
      await insertMetric(d2.id, { spendCents: 100 + i * 10, impressions: 600, fbLinkClicks: 10 });
    }

    const { client, calls } = recordingFB();
    const result = await runBanditStep({ campaignId: campaign.id, date: DATE, overrides: { fb: client } });

    expect(result.audiencesProcessed).toBe(2);

    const [aud1After] = await db.select().from(audiences).where(eq(audiences.id, aud1.id));
    const [aud2After] = await db.select().from(audiences).where(eq(audiences.id, aud2.id));

    // total budget preserved within rounding tolerance
    const total = aud1After.dailyBudgetCents + aud2After.dailyBudgetCents;
    expect(Math.abs(total - campaign.dailyBudgetCents)).toBeLessThanOrEqual(2);

    // With equal scores, algo proposes equal split (5000/5000).
    // aud1 share=0.2, cap hi=0.24; aud2 share=0.8, cap lo=0.64.
    // After renormalising capped shares (0.24+0.64=0.88):
    //   aud1 final share ≈ 0.2727 → ~2727 cents
    //   aud2 final share ≈ 0.7273 → ~7273 cents
    expect(aud1After.dailyBudgetCents).toBeGreaterThan(2000); // gained
    expect(aud2After.dailyBudgetCents).toBeLessThan(8000);    // lost

    // Sanity: values stay within renormalized-cap range (with rounding)
    expect(aud1After.dailyBudgetCents).toBeGreaterThanOrEqual(2700);
    expect(aud1After.dailyBudgetCents).toBeLessThanOrEqual(2800);
    expect(aud2After.dailyBudgetCents).toBeGreaterThanOrEqual(7200);
    expect(aud2After.dailyBudgetCents).toBeLessThanOrEqual(7300);

    // reweighted flag and FB calls
    expect(result.budgetsReweighted).toBeGreaterThan(0);
    expect(calls.setBudget.length).toBeGreaterThan(0);

    // audit rows for budget_reweighted
    const budgetAudits = await db.select().from(auditLog).where(eq(auditLog.event, "budget_reweighted"));
    expect(budgetAudits.length).toBeGreaterThan(0);
  });

  it("idempotent: calling twice does not double-pause already-paused ads", async () => {
    const { artist, release, seed, asset } = await seedBase();
    const campaign = await seedCampaign([seed.id], release.id, artist.id);
    const [aud] = await listAudiencesForCampaign(campaign.id);

    const adIds: string[] = [];
    for (let i = 0; i < 5; i++) {
      const draft = await createDraftAd({
        campaignId: campaign.id, audienceId: aud.id, assetId: asset.id,
        copyHeadline: `Hid${i}`, copyPrimaryText: `Pid${i}`, copyBody: "",
      });
      await publishAd(draft.id);
      await db.update(ads).set({ fbAdId: `test_idem_fb_${i}` }).where(eq(ads.id, draft.id));
      adIds.push(draft.id);
    }

    const spends = [100, 200, 300, 400, 500];
    for (let i = 0; i < 5; i++) {
      await insertMetric(adIds[i], { spendCents: spends[i], impressions: 600, fbLinkClicks: 10 });
    }

    const { client: client1, calls: calls1 } = recordingFB();
    const result1 = await runBanditStep({ campaignId: campaign.id, date: DATE, overrides: { fb: client1 } });
    expect(result1.adsPaused).toBe(2);
    expect(calls1.pauseAd).toHaveLength(2);

    // Run again — already-paused ads should not be paused again
    const { client: client2, calls: calls2 } = recordingFB();
    const result2 = await runBanditStep({ campaignId: campaign.id, date: DATE, overrides: { fb: client2 } });
    expect(result2.adsPaused).toBe(0);
    expect(calls2.pauseAd).toHaveLength(0);

    // Total paused ads is still 2 (not 4)
    const allAds = await db.select().from(ads).where(eq(ads.campaignId, campaign.id));
    const pausedCount = allAds.filter((a) => a.status === "paused").length;
    expect(pausedCount).toBe(2);
  });
});
