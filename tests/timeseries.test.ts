import { describe, it, expect } from "vitest";
import { db } from "@/lib/db";
import { artists, releases, audienceSeeds, assets, campaigns, audiences, ads, adMetricDaily, releaseMetricDaily } from "@/lib/db/schema";
import { spendStreamSeries, compositeSeries } from "@/lib/metrics/timeseries";

async function seed() {
  const [a] = await db.insert(artists).values({ name: "A", spotifyArtistId: "p8_ts", timezone: "UTC" }).returning();
  const [r] = await db.insert(releases).values({
    artistId: a.id, kind: "track", spotifyId: "p8_ts_t", title: "T", releaseDate: "2026-06-01",
  }).returning();
  const [seed] = await db.insert(audienceSeeds).values({
    artistId: a.id, name: "x", targetingSpec: { geo: { countries: ["US"] } },
  }).returning();
  const [asset] = await db.insert(assets).values({
    artistId: a.id, kind: "image", url: "/u/x.png", bytes: 1, contentType: "image/png",
  }).returning();
  const [c] = await db.insert(campaigns).values({
    artistId: a.id, releaseId: r.id, dailyBudgetCents: 1000,
    startDate: "2026-06-15", endDate: "2026-07-15", timezone: "UTC",
  }).returning();
  const [aud] = await db.insert(audiences).values({
    campaignId: c.id, seedId: seed.id, name: "n", fbTargetingSpec: {}, dailyBudgetCents: 1000,
  }).returning();
  const [ad] = await db.insert(ads).values({
    campaignId: c.id, audienceId: aud.id, assetId: asset.id,
    copyHeadline: "h", copyPrimaryText: "p", copyBody: "",
  }).returning();
  // baseline: 3 days before start
  await db.insert(releaseMetricDaily).values([
    { releaseId: r.id, date: "2026-06-12", spotifyStreams: 100, source: "s4a" },
    { releaseId: r.id, date: "2026-06-13", spotifyStreams: 110, source: "s4a" },
    { releaseId: r.id, date: "2026-06-14", spotifyStreams: 120, source: "s4a" },
  ]);
  // campaign days
  await db.insert(adMetricDaily).values([
    { adId: ad.id, date: "2026-06-15", spendCents: 1000 },
    { adId: ad.id, date: "2026-06-16", spendCents: 1500 },
  ]);
  await db.insert(releaseMetricDaily).values([
    { releaseId: r.id, date: "2026-06-15", spotifyStreams: 200, source: "s4a" },
    { releaseId: r.id, date: "2026-06-16", spotifyStreams: 250, source: "web_estimate" },
  ]);
  return { campaign: c, release: r };
}

describe("spendStreamSeries", () => {
  it("merges spend + streams + baseline across the window", async () => {
    const { campaign, release } = await seed();
    const series = await spendStreamSeries({
      campaignId: campaign.id, releaseId: release.id, campaignStartDate: campaign.startDate,
      fromDate: "2026-06-15", toDate: "2026-06-16",
    });
    expect(series).toEqual([
      { date: "2026-06-15", spendCents: 1000, streams: 200, baseline: 110 },
      // web_estimate → streams null
      { date: "2026-06-16", spendCents: 1500, streams: null, baseline: 110 },
    ]);
  });

  it("empty when no rows", async () => {
    // Use non-existent campaign + release IDs so neither spend nor stream rows exist
    const series = await spendStreamSeries({
      campaignId: "00000000-0000-0000-0000-000000000000",
      releaseId: "00000000-0000-0000-0000-000000000001",
      campaignStartDate: "2026-06-15",
      fromDate: "2026-06-15", toDate: "2026-06-16",
    });
    expect(series).toEqual([]);
  });
});

async function seedComposite() {
  const [a] = await db.insert(artists).values({ name: "B", spotifyArtistId: "p8_comp", timezone: "UTC" }).returning();
  const [r] = await db.insert(releases).values({
    artistId: a.id, kind: "track", spotifyId: "p8_comp_t", title: "C", releaseDate: "2026-06-01",
  }).returning();
  const [seed] = await db.insert(audienceSeeds).values({
    artistId: a.id, name: "y", targetingSpec: { geo: { countries: ["US"] } },
  }).returning();
  const [asset] = await db.insert(assets).values({
    artistId: a.id, kind: "image", url: "/u/y.png", bytes: 1, contentType: "image/png",
  }).returning();
  const [c] = await db.insert(campaigns).values({
    artistId: a.id, releaseId: r.id, dailyBudgetCents: 1000,
    startDate: "2026-06-01", endDate: "2026-07-01", timezone: "UTC",
  }).returning();
  const [aud] = await db.insert(audiences).values({
    campaignId: c.id, seedId: seed.id, name: "n", fbTargetingSpec: {}, dailyBudgetCents: 1000,
  }).returning();
  // 3 ads: ad1 highest spend, ad2 mid, ad3 lowest
  const [ad1] = await db.insert(ads).values({
    campaignId: c.id, audienceId: aud.id, assetId: asset.id,
    copyHeadline: "Best Summer Hit Ever", copyPrimaryText: "p", copyBody: "",
  }).returning();
  const [ad2] = await db.insert(ads).values({
    campaignId: c.id, audienceId: aud.id, assetId: asset.id,
    copyHeadline: "Stream This Now", copyPrimaryText: "p", copyBody: "",
  }).returning();
  const [ad3] = await db.insert(ads).values({
    campaignId: c.id, audienceId: aud.id, assetId: asset.id,
    copyHeadline: "Stream This Now", copyPrimaryText: "p2", copyBody: "",
  }).returning();

  await db.insert(adMetricDaily).values([
    { adId: ad1.id, date: "2026-06-10", spendCents: 3000, compositeScore: 0.8 },
    { adId: ad1.id, date: "2026-06-11", spendCents: 2000, compositeScore: 0.7 },
    { adId: ad2.id, date: "2026-06-10", spendCents: 1500, compositeScore: 0.5 },
    { adId: ad3.id, date: "2026-06-10", spendCents: 500, compositeScore: 0.2 },
  ]);
  return { campaign: c, ad1, ad2, ad3 };
}

describe("compositeSeries", () => {
  it("returns empty when no ads", async () => {
    const result = await compositeSeries({
      campaignId: "00000000-0000-0000-0000-000000000000",
      fromDate: "2026-06-01",
      toDate: "2026-06-30",
    });
    expect(result).toEqual({ data: [], adKeys: [] });
  });

  it("top-N by lifetime spend, pivot shape, truncated headlines", async () => {
    const { campaign } = await seedComposite();
    const result = await compositeSeries({
      campaignId: campaign.id,
      fromDate: "2026-06-10",
      toDate: "2026-06-11",
      limit: 2,
    });
    // ad1 has 5000 total spend, ad2 has 1500 — top 2 excludes ad3
    expect(result.adKeys).toHaveLength(2);
    // ad1 headline truncated to 24 chars
    expect(result.adKeys[0]).toBe("Best Summer Hit Ever");
    // ad2 headline is "Stream This Now"
    expect(result.adKeys[1]).toBe("Stream This Now");
    // 2 dates: 2026-06-10, 2026-06-11
    expect(result.data).toHaveLength(2);
    const d10 = result.data.find((d) => d.date === "2026-06-10");
    expect(d10?.["Best Summer Hit Ever"]).toBeCloseTo(0.8);
    expect(d10?.["Stream This Now"]).toBeCloseTo(0.5);
    // ad1 on 2026-06-11, ad2 missing → null fill
    const d11 = result.data.find((d) => d.date === "2026-06-11");
    expect(d11?.["Best Summer Hit Ever"]).toBeCloseTo(0.7);
    expect(d11?.["Stream This Now"]).toBeNull();
  });

  it("deduplicates headline labels with (2) suffix", async () => {
    const { campaign } = await seedComposite();
    // limit 3 to include both "Stream This Now" ads
    const result = await compositeSeries({
      campaignId: campaign.id,
      fromDate: "2026-06-10",
      toDate: "2026-06-11",
      limit: 3,
    });
    // ad1 highest, ad2 next, ad3 last — both ad2 and ad3 share "Stream This Now"
    expect(result.adKeys).toContain("Stream This Now");
    expect(result.adKeys).toContain("Stream This Now (2)");
  });
});
