import { describe, it, expect } from "vitest";
import { db } from "@/lib/db";
import { artists, releases, audienceSeeds, assets } from "@/lib/db/schema";
import { setSecret } from "@/lib/secrets/mutations";
import { createCampaign } from "@/lib/campaigns/mutations";
import { listAudiencesForCampaign } from "@/lib/campaigns/queries";
import { createDraftAd, publishAd, pauseAdById, killAdById } from "@/lib/ads/mutations";
import { getAd, listAds } from "@/lib/ads/queries";
import { listAuditFor } from "@/lib/audit/queries";

async function seedCampaign() {
  const [a] = await db.insert(artists).values({ name: "Hana Vu", spotifyArtistId: "hv_ad", timezone: "UTC" }).returning();
  const [r] = await db.insert(releases).values({
    artistId: a.id, kind: "track", spotifyId: "tr_ad", title: "Song", releaseDate: "2026-06-01",
  }).returning();
  const [seed] = await db.insert(audienceSeeds).values({
    artistId: a.id, name: "us25-44", targetingSpec: { geo: { countries: ["US"] } },
  }).returning();
  const [asset] = await db.insert(assets).values({
    artistId: a.id, kind: "image", url: "/api/uploads/abc.png", label: "cover",
    bytes: 1000, contentType: "image/png",
  }).returning();
  await setSecret("fb.ad_account_id", "act_99");
  await setSecret("fb.page_id", "12345");
  const campaign = await createCampaign({
    artistId: a.id, releaseId: r.id, dailyBudgetCents: 1000,
    startDate: "2026-06-01", endDate: "2026-07-01",
    audienceSeedIds: [seed.id],
    spotifyTrackOrAlbumUrl: "https://open.spotify.com/track/abc",
  });
  const [audience] = await listAudiencesForCampaign(campaign.id);
  return { artist: a, campaign, audience, asset };
}

describe("createDraftAd", () => {
  it("happy path: inserts draft + audit", async () => {
    const { campaign, audience, asset } = await seedCampaign();
    const ad = await createDraftAd({
      campaignId: campaign.id,
      audienceId: audience.id,
      assetId: asset.id,
      copyHeadline: "Listen on Spotify",
      copyPrimaryText: "Hana Vu's new track is out now. Tap to play.",
      copyBody: "From Romanticism (2026)",
    });
    expect(ad.status).toBe("draft");
    expect(ad.generation).toBe(0);
    const events = (await listAuditFor("ad", ad.id)).map((x) => x.event);
    expect(events).toContain("draft_created");
  });

  it("rejects audience that doesn't belong to campaign", async () => {
    const { campaign, asset } = await seedCampaign();
    const fakeAudienceId = "00000000-0000-0000-0000-000000000099";
    await expect(createDraftAd({
      campaignId: campaign.id,
      audienceId: fakeAudienceId,
      assetId: asset.id,
      copyHeadline: "x", copyPrimaryText: "y", copyBody: "z",
    })).rejects.toThrow(/audience/);
  });

  it("rejects asset that doesn't belong to campaign's artist", async () => {
    const { campaign, audience } = await seedCampaign();
    // create a second artist + asset
    const [otherArtist] = await db.insert(artists).values({ name: "Other", spotifyArtistId: "o_ad", timezone: "UTC" }).returning();
    const [otherAsset] = await db.insert(assets).values({
      artistId: otherArtist.id, kind: "image", url: "/api/uploads/zzz.png",
      bytes: 1, contentType: "image/png",
    }).returning();
    await expect(createDraftAd({
      campaignId: campaign.id,
      audienceId: audience.id,
      assetId: otherAsset.id,
      copyHeadline: "x", copyPrimaryText: "y", copyBody: "z",
    })).rejects.toThrow(/asset/);
  });

  it("rejects oversized headline / primary text", async () => {
    const { campaign, audience, asset } = await seedCampaign();
    await expect(createDraftAd({
      campaignId: campaign.id,
      audienceId: audience.id,
      assetId: asset.id,
      copyHeadline: "x".repeat(41),
      copyPrimaryText: "ok",
      copyBody: "",
    })).rejects.toThrow(/copyHeadline/);
    await expect(createDraftAd({
      campaignId: campaign.id,
      audienceId: audience.id,
      assetId: asset.id,
      copyHeadline: "ok",
      copyPrimaryText: "x".repeat(126),
      copyBody: "",
    })).rejects.toThrow(/copyPrimaryText/);
  });
});

describe("publishAd", () => {
  it("creates FB creative + ad, flips status, writes audit", async () => {
    const { campaign, audience, asset } = await seedCampaign();
    const ad = await createDraftAd({
      campaignId: campaign.id, audienceId: audience.id, assetId: asset.id,
      copyHeadline: "Listen", copyPrimaryText: "Out now.", copyBody: "",
    });
    await publishAd(ad.id);
    const fresh = await getAd(ad.id);
    expect(fresh?.status).toBe("published");
    expect(fresh?.fbAdId).toMatch(/^fb_ad_/);
    expect(fresh?.publishAt).toBeInstanceOf(Date);
    const events = (await listAuditFor("ad", ad.id)).map((x) => x.event);
    expect(events).toContain("published");
  });

  it("rejects publish on a rejected ad", async () => {
    const { campaign, audience, asset } = await seedCampaign();
    const ad = await createDraftAd({
      campaignId: campaign.id, audienceId: audience.id, assetId: asset.id,
      copyHeadline: "x", copyPrimaryText: "y", copyBody: "",
    });
    // simulate rejection
    const { ads } = await import("@/lib/db/schema");
    const { eq } = await import("drizzle-orm");
    await db.update(ads).set({ status: "rejected" }).where(eq(ads.id, ad.id));
    await expect(publishAd(ad.id)).rejects.toThrow(/rejected/);
  });

  it("rejects publish when audience has no fbAdSetId", async () => {
    const { campaign, audience, asset } = await seedCampaign();
    // wipe the audience's fbAdSetId
    const { audiences } = await import("@/lib/db/schema");
    const { eq } = await import("drizzle-orm");
    await db.update(audiences).set({ fbAdSetId: null }).where(eq(audiences.id, audience.id));
    const ad = await createDraftAd({
      campaignId: campaign.id, audienceId: audience.id, assetId: asset.id,
      copyHeadline: "x", copyPrimaryText: "y", copyBody: "",
    });
    await expect(publishAd(ad.id)).rejects.toThrow(/fbAdSetId/);
  });
});

describe("pause / kill ad", () => {
  it("pauseAdById flips status + writes audit", async () => {
    const { campaign, audience, asset } = await seedCampaign();
    const ad = await createDraftAd({
      campaignId: campaign.id, audienceId: audience.id, assetId: asset.id,
      copyHeadline: "x", copyPrimaryText: "y", copyBody: "",
    });
    await publishAd(ad.id);
    await pauseAdById(ad.id);
    expect((await getAd(ad.id))?.status).toBe("paused");
    expect((await listAuditFor("ad", ad.id)).map((x) => x.event)).toContain("paused");
  });

  it("killAdById flips status to killed", async () => {
    const { campaign, audience, asset } = await seedCampaign();
    const ad = await createDraftAd({
      campaignId: campaign.id, audienceId: audience.id, assetId: asset.id,
      copyHeadline: "x", copyPrimaryText: "y", copyBody: "",
    });
    await publishAd(ad.id);
    await killAdById(ad.id);
    expect((await getAd(ad.id))?.status).toBe("killed");
  });
});

describe("listAds", () => {
  it("filters by campaign and audience", async () => {
    const { campaign, audience, asset } = await seedCampaign();
    await createDraftAd({
      campaignId: campaign.id, audienceId: audience.id, assetId: asset.id,
      copyHeadline: "x", copyPrimaryText: "y", copyBody: "",
    });
    expect(await listAds({ campaignId: campaign.id })).toHaveLength(1);
    expect(await listAds({ audienceId: audience.id })).toHaveLength(1);
    expect(await listAds({ campaignId: "00000000-0000-0000-0000-000000000000" })).toHaveLength(0);
  });
});
