import { describe, it, expect } from "vitest";
import { db } from "@/lib/db";
import { artists, releases, audienceSeeds, assets, campaigns, audiences, ads, adMetricDaily, llmRuns } from "@/lib/db/schema";
import { dailyCosts, llmCostByKind } from "@/lib/costs/aggregate";

async function seedCampaignWithCosts() {
  const [a] = await db.insert(artists).values({ name: "A", spotifyArtistId: "p8_cost", timezone: "UTC" }).returning();
  const [r] = await db.insert(releases).values({
    artistId: a.id, kind: "track", spotifyId: "p8_cost_t", title: "T", releaseDate: "2026-06-01",
  }).returning();
  const [seed] = await db.insert(audienceSeeds).values({
    artistId: a.id, name: "x", targetingSpec: { geo: { countries: ["US"] } },
  }).returning();
  const [asset] = await db.insert(assets).values({
    artistId: a.id, kind: "image", url: "/u/x.png", bytes: 1, contentType: "image/png",
  }).returning();
  const [c] = await db.insert(campaigns).values({
    artistId: a.id, releaseId: r.id, dailyBudgetCents: 1000,
    startDate: "2026-06-01", endDate: "2026-07-01", timezone: "UTC",
  }).returning();
  const [aud] = await db.insert(audiences).values({
    campaignId: c.id, seedId: seed.id, name: "n", fbTargetingSpec: {}, dailyBudgetCents: 1000,
  }).returning();
  const [ad1] = await db.insert(ads).values({
    campaignId: c.id, audienceId: aud.id, assetId: asset.id,
    copyHeadline: "h1", copyPrimaryText: "p1", copyBody: "",
  }).returning();
  const [ad2] = await db.insert(ads).values({
    campaignId: c.id, audienceId: aud.id, assetId: asset.id,
    copyHeadline: "h2", copyPrimaryText: "p2", copyBody: "",
  }).returning();

  // ad spend across multiple dates
  await db.insert(adMetricDaily).values([
    { adId: ad1.id, date: "2026-06-10", spendCents: 100 },
    { adId: ad2.id, date: "2026-06-10", spendCents: 200 },
    { adId: ad1.id, date: "2026-06-11", spendCents: 150 },
    { adId: ad2.id, date: "2026-06-12", spendCents: 300 },
  ]);
  // LLM costs across dates
  await db.insert(llmRuns).values([
    { campaignId: c.id, date: "2026-06-10", kind: "critique", model: "x", costCents: 5, promptHash: "h1" },
    { campaignId: c.id, date: "2026-06-10", kind: "generate", model: "x", costCents: 12, promptHash: "h2" },
    { campaignId: c.id, date: "2026-06-10", kind: "safety", model: "x", costCents: 1, promptHash: "h3" },
    { campaignId: c.id, date: "2026-06-12", kind: "generate", model: "x", costCents: 8, promptHash: "h4" },
  ]);
  return { campaign: c };
}

describe("dailyCosts", () => {
  it("merges ad spend + LLM cost per date, sorted ascending", async () => {
    const { campaign } = await seedCampaignWithCosts();
    const rows = await dailyCosts({ campaignId: campaign.id, fromDate: "2026-06-09", toDate: "2026-06-15" });
    expect(rows).toEqual([
      { date: "2026-06-10", adSpendCents: 300, llmCostCents: 18, totalCents: 318 },
      { date: "2026-06-11", adSpendCents: 150, llmCostCents: 0, totalCents: 150 },
      { date: "2026-06-12", adSpendCents: 300, llmCostCents: 8, totalCents: 308 },
    ]);
  });

  it("filters by date range", async () => {
    const { campaign } = await seedCampaignWithCosts();
    const rows = await dailyCosts({ campaignId: campaign.id, fromDate: "2026-06-11", toDate: "2026-06-11" });
    expect(rows).toEqual([
      { date: "2026-06-11", adSpendCents: 150, llmCostCents: 0, totalCents: 150 },
    ]);
  });

  it("returns empty for a campaign with no ads/runs", async () => {
    const [a] = await db.insert(artists).values({ name: "B", spotifyArtistId: "p8_cost_empty", timezone: "UTC" }).returning();
    const [r] = await db.insert(releases).values({
      artistId: a.id, kind: "track", spotifyId: "p8_cost_t2", title: "T", releaseDate: "2026-06-01",
    }).returning();
    const [c] = await db.insert(campaigns).values({
      artistId: a.id, releaseId: r.id, dailyBudgetCents: 1000,
      startDate: "2026-06-01", endDate: "2026-07-01", timezone: "UTC",
    }).returning();
    const rows = await dailyCosts({ campaignId: c.id, fromDate: "2026-06-01", toDate: "2026-07-01" });
    expect(rows).toEqual([]);
  });
});

describe("llmCostByKind", () => {
  it("sums cost per kind + grand total", async () => {
    const { campaign } = await seedCampaignWithCosts();
    const r = await llmCostByKind(campaign.id);
    expect(r).toEqual({ critique: 5, generate: 20, safety: 1, total: 26 });
  });

  it("zero across the board for a fresh campaign", async () => {
    const [a] = await db.insert(artists).values({ name: "C", spotifyArtistId: "p8_cost_zero", timezone: "UTC" }).returning();
    const [r] = await db.insert(releases).values({
      artistId: a.id, kind: "track", spotifyId: "p8_cost_t3", title: "T", releaseDate: "2026-06-01",
    }).returning();
    const [c] = await db.insert(campaigns).values({
      artistId: a.id, releaseId: r.id, dailyBudgetCents: 1000,
      startDate: "2026-06-01", endDate: "2026-07-01", timezone: "UTC",
    }).returning();
    const out = await llmCostByKind(c.id);
    expect(out).toEqual({ critique: 0, generate: 0, safety: 0, total: 0 });
  });
});
