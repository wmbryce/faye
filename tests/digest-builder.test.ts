import { describe, it, expect } from "vitest";
import { db } from "@/lib/db";
import { artists, releases, audienceSeeds, assets, campaigns, audiences, ads, adMetricDaily, releaseMetricDaily } from "@/lib/db/schema";
import { buildCampaignDigest } from "@/lib/email/digest/builder";
import { verifyRejectToken } from "@/lib/email/reject-tokens";

async function seed() {
  const [a] = await db.insert(artists).values({ name: "Hana Vu", spotifyArtistId: "p7_dig", timezone: "UTC" }).returning();
  const [r] = await db.insert(releases).values({
    artistId: a.id, kind: "track", spotifyId: "p7_dig_t", title: "Romanticism", releaseDate: "2026-06-01",
  }).returning();
  const [seedRow] = await db.insert(audienceSeeds).values({
    artistId: a.id, name: "indie us", targetingSpec: { geo: { countries: ["US"] } },
  }).returning();
  const [asset] = await db.insert(assets).values({
    artistId: a.id, kind: "image", url: "/api/uploads/cover.png", label: "cover", bytes: 1, contentType: "image/png",
  }).returning();
  const [c] = await db.insert(campaigns).values({
    artistId: a.id, releaseId: r.id, dailyBudgetCents: 2000,
    startDate: "2026-06-01", endDate: "2026-07-01", timezone: "UTC",
  }).returning();
  const [aud] = await db.insert(audiences).values({
    campaignId: c.id, seedId: seedRow.id, name: "indie us 25-44", fbTargetingSpec: {}, dailyBudgetCents: 2000,
  }).returning();
  const [ad1] = await db.insert(ads).values({
    campaignId: c.id, audienceId: aud.id, assetId: asset.id,
    copyHeadline: "h1", copyPrimaryText: "p1", copyBody: "",
    status: "published", fbAdId: "fb_ad_1",
  }).returning();
  const [ad2] = await db.insert(ads).values({
    campaignId: c.id, audienceId: aud.id, assetId: asset.id,
    copyHeadline: "h2", copyPrimaryText: "p2", copyBody: "",
    status: "published", fbAdId: "fb_ad_2",
  }).returning();
  const [pad] = await db.insert(ads).values({
    campaignId: c.id, audienceId: aud.id, assetId: asset.id,
    copyHeadline: "new variant", copyPrimaryText: "different angle", copyBody: "",
    status: "pending", publishAt: new Date(Date.now() + 30 * 60 * 1000),
  }).returning();

  await db.insert(adMetricDaily).values([
    { adId: ad1.id, date: "2026-06-15", spendCents: 500, impressions: 1000, fbLinkClicks: 50, smartlinkClicks: 40, smartlinkStreams: 12, compositeScore: 0.3 },
    { adId: ad2.id, date: "2026-06-15", spendCents: 700, impressions: 1500, fbLinkClicks: 80, smartlinkClicks: 60, smartlinkStreams: 18, compositeScore: -0.2 },
  ]);
  await db.insert(releaseMetricDaily).values([
    { releaseId: r.id, date: "2026-05-29", spotifyStreams: 100, source: "s4a" },
    { releaseId: r.id, date: "2026-05-30", spotifyStreams: 110, source: "s4a" },
    { releaseId: r.id, date: "2026-05-31", spotifyStreams: 120, source: "s4a" },
    { releaseId: r.id, date: "2026-06-15", spotifyStreams: 200, source: "s4a" },
  ]);
  return { campaign: c, ad1, ad2, pendingAd: pad };
}

describe("buildCampaignDigest", () => {
  it("aggregates metrics + lists pending ads + signs reject URLs", async () => {
    const { campaign, pendingAd } = await seed();
    const digest = await buildCampaignDigest({ campaignId: campaign.id, yesterday: "2026-06-15" });
    expect(digest.campaignName).toBe("Hana Vu — Romanticism");
    expect(digest.yesterday.spendCents).toBe(1200);
    expect(digest.yesterday.impressions).toBe(2500);
    expect(digest.yesterday.fbLinkClicks).toBe(130);
    expect(digest.yesterday.smartlinkClicks).toBe(100);
    expect(digest.yesterday.smartlinkStreams).toBe(30);
    expect(digest.yesterday.composite).toBeCloseTo(0.05, 2);
    expect(digest.yesterday.degraded).toBe(false);
    expect(digest.yesterday.spotifyStreams).toBe(200);
    expect(digest.yesterday.spotifyStreamDelta).toBe(200 - 110);
    expect(digest.pendingAds).toHaveLength(1);
    const p = digest.pendingAds[0];
    expect(p.adId).toBe(pendingAd.id);
    expect(p.audienceName).toBe("indie us 25-44");
    expect(p.assetUrl).toContain("/api/uploads/cover.png");
    expect(p.rejectUrl).toContain("/reject/");
    const token = decodeURIComponent(p.rejectUrl.split("/reject/")[1]);
    const v = await verifyRejectToken(token);
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.adId).toBe(pendingAd.id);
  });

  it("composite=null when no compositeScore rows", async () => {
    const { campaign } = await seed();
    await db.update(adMetricDaily).set({ compositeScore: null });
    const digest = await buildCampaignDigest({ campaignId: campaign.id, yesterday: "2026-06-15" });
    expect(digest.yesterday.composite).toBeNull();
  });

  it("degraded=true when release metric source != s4a", async () => {
    const { campaign } = await seed();
    await db.update(releaseMetricDaily).set({ source: "web_estimate" });
    const digest = await buildCampaignDigest({ campaignId: campaign.id, yesterday: "2026-06-15" });
    expect(digest.yesterday.degraded).toBe(true);
  });

  it("smartlinkStreams null when no per-ad streams present", async () => {
    const { campaign } = await seed();
    await db.update(adMetricDaily).set({ smartlinkStreams: null });
    const digest = await buildCampaignDigest({ campaignId: campaign.id, yesterday: "2026-06-15" });
    expect(digest.yesterday.smartlinkStreams).toBeNull();
  });
});
