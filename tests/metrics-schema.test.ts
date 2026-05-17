import { describe, it, expect } from "vitest";
import { db } from "@/lib/db";
import { artists, releases, audienceSeeds, assets, campaigns, audiences, ads, adMetricDaily, releaseMetricDaily } from "@/lib/db/schema";

describe("metric schemas", () => {
  it("inserts ad_metric_daily and release_metric_daily rows", async () => {
    const [a] = await db.insert(artists).values({ name: "A", spotifyArtistId: "p5_s1", timezone: "UTC" }).returning();
    const [r] = await db.insert(releases).values({
      artistId: a.id, kind: "track", spotifyId: "p5_t1", title: "Song", releaseDate: "2026-06-01",
    }).returning();
    const [seed] = await db.insert(audienceSeeds).values({
      artistId: a.id, name: "x", targetingSpec: { geo: { countries: ["US"] } },
    }).returning();
    const [asset] = await db.insert(assets).values({
      artistId: a.id, kind: "image", url: "/api/uploads/x.png", bytes: 1, contentType: "image/png",
    }).returning();
    const [c] = await db.insert(campaigns).values({
      artistId: a.id, releaseId: r.id, dailyBudgetCents: 1000,
      startDate: "2026-06-01", endDate: "2026-07-01", timezone: "UTC",
    }).returning();
    const [aud] = await db.insert(audiences).values({
      campaignId: c.id, seedId: seed.id, name: "n",
      fbTargetingSpec: {}, dailyBudgetCents: 1000,
    }).returning();
    const [ad] = await db.insert(ads).values({
      campaignId: c.id, audienceId: aud.id, assetId: asset.id,
      copyHeadline: "h", copyBody: "b", copyPrimaryText: "p",
    }).returning();

    const [m] = await db.insert(adMetricDaily).values({
      adId: ad.id, date: "2026-06-02", spendCents: 500, impressions: 1000, fbLinkClicks: 50,
      smartlinkClicks: 45, smartlinkStreams: 12, compositeScore: 0.42,
    }).returning();
    expect(m.compositeScore).toBeCloseTo(0.42, 2);
    expect(m.spendCents).toBe(500);

    const [rm] = await db.insert(releaseMetricDaily).values({
      releaseId: r.id, date: "2026-06-02", spotifyStreams: 1500, source: "web_estimate",
    }).returning();
    expect(rm.source).toBe("web_estimate");
  });

  it("enforces unique (ad_id, date)", async () => {
    const [a] = await db.insert(artists).values({ name: "A", spotifyArtistId: "p5_s2", timezone: "UTC" }).returning();
    const [r] = await db.insert(releases).values({
      artistId: a.id, kind: "track", spotifyId: "p5_t2", title: "Song", releaseDate: "2026-06-01",
    }).returning();
    const [seed] = await db.insert(audienceSeeds).values({
      artistId: a.id, name: "x", targetingSpec: { geo: { countries: ["US"] } },
    }).returning();
    const [asset] = await db.insert(assets).values({
      artistId: a.id, kind: "image", url: "/api/uploads/x2.png", bytes: 1, contentType: "image/png",
    }).returning();
    const [c] = await db.insert(campaigns).values({
      artistId: a.id, releaseId: r.id, dailyBudgetCents: 1000,
      startDate: "2026-06-01", endDate: "2026-07-01", timezone: "UTC",
    }).returning();
    const [aud] = await db.insert(audiences).values({
      campaignId: c.id, seedId: seed.id, name: "n",
      fbTargetingSpec: {}, dailyBudgetCents: 1000,
    }).returning();
    const [ad] = await db.insert(ads).values({
      campaignId: c.id, audienceId: aud.id, assetId: asset.id,
      copyHeadline: "h", copyBody: "b", copyPrimaryText: "p",
    }).returning();
    await db.insert(adMetricDaily).values({ adId: ad.id, date: "2026-06-02" });
    await expect(
      db.insert(adMetricDaily).values({ adId: ad.id, date: "2026-06-02" })
    ).rejects.toThrow();
  });
});
