import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { artists, releases, audienceSeeds, assets, campaigns, audiences, ads, consumedRejectTokens, notifications } from "@/lib/db/schema";

describe("phase 7 schema", () => {
  it("consumed_reject_tokens cascades on ad delete + has nonce PK", async () => {
    const [a] = await db.insert(artists).values({ name: "A", spotifyArtistId: "p7_s1", timezone: "UTC" }).returning();
    const [r] = await db.insert(releases).values({
      artistId: a.id, kind: "track", spotifyId: "p7_t1", title: "T", releaseDate: "2026-06-01",
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
    const [ad] = await db.insert(ads).values({
      campaignId: c.id, audienceId: aud.id, assetId: asset.id,
      copyHeadline: "h", copyBody: "b", copyPrimaryText: "p",
    }).returning();
    await db.insert(consumedRejectTokens).values({ nonce: "abc123", adId: ad.id });
    // unique-on-nonce: cannot reuse
    await expect(db.insert(consumedRejectTokens).values({ nonce: "abc123", adId: ad.id })).rejects.toThrow();

    // ON DELETE CASCADE: token row goes with parent ad
    await db.delete(ads).where(eq(ads.id, ad.id));
    const remaining = await db
      .select()
      .from(consumedRejectTokens)
      .where(eq(consumedRejectTokens.nonce, "abc123"));
    expect(remaining).toHaveLength(0);
  });

  it("notifications: campaignId nullable; payload jsonb roundtrip", async () => {
    const [n] = await db.insert(notifications).values({
      kind: "daily_digest",
      payload: { campaignIds: [], msgId: "msg_1" },
    }).returning();
    expect(n.campaignId).toBeNull();
    expect(n.payload).toEqual({ campaignIds: [], msgId: "msg_1" });
  });
});
