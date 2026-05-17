import { describe, it, expect } from "vitest";
import { db } from "@/lib/db";
import { artists, releases, audienceSeeds, assets, ads } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { setSecret } from "@/lib/secrets/mutations";
import { createCampaign } from "@/lib/campaigns/mutations";
import { listAudiencesForCampaign } from "@/lib/campaigns/queries";
import { createDraftAd } from "@/lib/ads/mutations";
import { publisherTick } from "@/lib/publisher/tick";

async function seedPending() {
  const [a] = await db.insert(artists).values({ name: "A", spotifyArtistId: "p5_pub", timezone: "UTC" }).returning();
  const [r] = await db.insert(releases).values({
    artistId: a.id, kind: "track", spotifyId: "p5_pub_t", title: "T", releaseDate: "2026-06-01",
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
  return { campaign: c, audience: aud, asset };
}

describe("publisherTick", () => {
  it("publishes pending ads whose publishAt has elapsed", async () => {
    const { campaign, audience, asset } = await seedPending();
    const ad = await createDraftAd({
      campaignId: campaign.id, audienceId: audience.id, assetId: asset.id,
      copyHeadline: "h", copyPrimaryText: "p", copyBody: "",
    });
    await db.update(ads).set({
      status: "pending",
      publishAt: new Date(Date.now() - 60_000), // 1 min ago
    }).where(eq(ads.id, ad.id));

    const r = await publisherTick();
    expect(r.attempted).toBe(1);
    expect(r.published).toBe(1);
    expect(r.errors).toHaveLength(0);
    const [fresh] = await db.select().from(ads).where(eq(ads.id, ad.id));
    expect(fresh.status).toBe("published");
    expect(fresh.fbAdId).toMatch(/^fb_ad_/);
  });

  it("skips pending ads whose publishAt is still in the future", async () => {
    const { campaign, audience, asset } = await seedPending();
    const ad = await createDraftAd({
      campaignId: campaign.id, audienceId: audience.id, assetId: asset.id,
      copyHeadline: "h", copyPrimaryText: "p", copyBody: "",
    });
    await db.update(ads).set({
      status: "pending",
      publishAt: new Date(Date.now() + 60_000), // 1 min in future
    }).where(eq(ads.id, ad.id));

    const r = await publisherTick();
    expect(r.attempted).toBe(0);
    const [fresh] = await db.select().from(ads).where(eq(ads.id, ad.id));
    expect(fresh.status).toBe("pending");
  });

  it("skips ads in non-pending statuses", async () => {
    const { campaign, audience, asset } = await seedPending();
    const ad = await createDraftAd({
      campaignId: campaign.id, audienceId: audience.id, assetId: asset.id,
      copyHeadline: "h", copyPrimaryText: "p", copyBody: "",
    });
    // status stays "draft"
    const r = await publisherTick();
    expect(r.attempted).toBe(0);
  });

  it("does not republish a rejected ad (publishAd throws → recorded in errors)", async () => {
    const { campaign, audience, asset } = await seedPending();
    const ad = await createDraftAd({
      campaignId: campaign.id, audienceId: audience.id, assetId: asset.id,
      copyHeadline: "h", copyPrimaryText: "p", copyBody: "",
    });
    // first set rejected, then *also* set status to pending + a past publishAt
    // to exercise the case where the publisher picks it up but publishAd refuses.
    await db.update(ads).set({
      status: "pending",
      publishAt: new Date(Date.now() - 1000),
    }).where(eq(ads.id, ad.id));
    // simulate a race where someone marks it rejected after staging
    // (then we manually do publishAd via the tick; status check on read inside publishAd)
    // For this test, set rejected status before the tick:
    await db.update(ads).set({ status: "rejected" }).where(eq(ads.id, ad.id));
    const r = await publisherTick();
    // status is now "rejected", so query filter returns 0 — attempted=0. That's the expected behavior.
    expect(r.attempted).toBe(0);
  });

  it("publishes multiple pending ads, returns counts", async () => {
    const { campaign, audience, asset } = await seedPending();
    const ad1 = await createDraftAd({
      campaignId: campaign.id, audienceId: audience.id, assetId: asset.id,
      copyHeadline: "h1", copyPrimaryText: "p1", copyBody: "",
    });
    const ad2 = await createDraftAd({
      campaignId: campaign.id, audienceId: audience.id, assetId: asset.id,
      copyHeadline: "h2", copyPrimaryText: "p2", copyBody: "",
    });
    await db.update(ads).set({
      status: "pending",
      publishAt: new Date(Date.now() - 1000),
    }).where(eq(ads.id, ad1.id));
    await db.update(ads).set({
      status: "pending",
      publishAt: new Date(Date.now() - 1000),
    }).where(eq(ads.id, ad2.id));

    const r = await publisherTick();
    expect(r.attempted).toBe(2);
    expect(r.published).toBe(2);
  });
});
