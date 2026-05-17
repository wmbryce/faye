import { describe, it, expect } from "vitest";
import { db } from "@/lib/db";
import { artists, releases, campaigns, audienceSeeds } from "@/lib/db/schema";
import { createCampaign } from "@/lib/campaigns/mutations";
import { listCampaigns, getCampaign, listAudiencesForCampaign } from "@/lib/campaigns/queries";
import { pauseCampaign, resumeCampaign, endCampaign } from "@/lib/campaigns/lifecycle";
import { listAuditFor } from "@/lib/audit/queries";
import { setSecret } from "@/lib/secrets/mutations";

describe("campaigns schema", () => {
  it("inserts a campaign and respects defaults", async () => {
    const [a] = await db.insert(artists).values({ name: "A", spotifyArtistId: "s1", timezone: "UTC" }).returning();
    const [r] = await db.insert(releases).values({
      artistId: a.id, kind: "track", spotifyId: "tr1", title: "Song", releaseDate: "2026-01-01",
    }).returning();
    const [c] = await db.insert(campaigns).values({
      artistId: a.id,
      releaseId: r.id,
      dailyBudgetCents: 1000,
      startDate: "2026-06-01",
      endDate: "2026-07-01",
      timezone: "UTC",
    }).returning();
    expect(c.status).toBe("draft");
    expect(c.dailyBudgetCents).toBe(1000);
  });
});

async function seedArtist() {
  const [a] = await db.insert(artists).values({ name: "Hana Vu", spotifyArtistId: `hv_${Date.now()}_${Math.random()}`, timezone: "America/Denver" }).returning();
  const [r] = await db.insert(releases).values({
    artistId: a.id, kind: "track", spotifyId: `tr1_${Date.now()}_${Math.random()}`, title: "Romanticism", releaseDate: "2026-06-01",
  }).returning();
  const [s1] = await db.insert(audienceSeeds).values({
    artistId: a.id, name: "indie us 25-44",
    targetingSpec: { geo: { countries: ["US"] }, age_min: 25, age_max: 44 },
  }).returning();
  const [s2] = await db.insert(audienceSeeds).values({
    artistId: a.id, name: "indie ca",
    targetingSpec: { geo: { countries: ["CA"] } },
  }).returning();
  await setSecret("fb.ad_account_id", "act_99");
  return { a, r, s1, s2 };
}

describe("campaign create", () => {
  it("happy path: creates FB campaign + smartlink + audiences + audit + active status", async () => {
    const { a, r, s1, s2 } = await seedArtist();
    const c = await createCampaign({
      artistId: a.id,
      releaseId: r.id,
      dailyBudgetCents: 2000,
      startDate: "2026-06-01",
      endDate: "2026-07-01",
      audienceSeedIds: [s1.id, s2.id],
      spotifyTrackOrAlbumUrl: "https://open.spotify.com/track/abc",
    });
    expect(c.status).toBe("active");
    expect(c.fbCampaignId).toMatch(/^fb_camp_/);
    expect(c.smartlinkId).toMatch(/^mock_sl_/);
    expect(c.smartlinkUrl).toContain("https://ffm.to/");

    const auds = await listAudiencesForCampaign(c.id);
    expect(auds).toHaveLength(2);
    expect(auds[0].dailyBudgetCents).toBe(1000); // 2000 / 2
    expect(auds.every((x) => x.fbAdSetId?.startsWith("fb_adset_"))).toBe(true);

    const audit = await listAuditFor("campaign", c.id);
    const events = audit.map((x) => x.event);
    expect(events).toContain("draft_created");
    expect(events).toContain("fb_campaign_created");
    expect(events).toContain("smartlink_created");
    expect(events).toContain("audience_created");
    expect(events).toContain("activated");
  });

  it("rejects empty audience list", async () => {
    const { a, r } = await seedArtist();
    await expect(createCampaign({
      artistId: a.id, releaseId: r.id, dailyBudgetCents: 100,
      startDate: "2026-06-01", endDate: "2026-07-01",
      audienceSeedIds: [], spotifyTrackOrAlbumUrl: "https://open.spotify.com/track/abc",
    })).rejects.toThrow(/audience/);
  });

  it("rejects >5 audience seeds", async () => {
    const { a, r } = await seedArtist();
    const ids = Array.from({ length: 6 }, (_, i) => `00000000-0000-0000-0000-00000000000${i}`);
    await expect(createCampaign({
      artistId: a.id, releaseId: r.id, dailyBudgetCents: 100,
      startDate: "2026-06-01", endDate: "2026-07-01",
      audienceSeedIds: ids, spotifyTrackOrAlbumUrl: "https://open.spotify.com/track/abc",
    })).rejects.toThrow(/audience/);
  });

  it("rejects release belonging to a different artist", async () => {
    const { r, s1 } = await seedArtist();
    const [a2] = await db.insert(artists).values({ name: "Other", spotifyArtistId: `o_${Date.now()}_${Math.random()}`, timezone: "UTC" }).returning();
    await expect(createCampaign({
      artistId: a2.id, releaseId: r.id, dailyBudgetCents: 100,
      startDate: "2026-06-01", endDate: "2026-07-01",
      audienceSeedIds: [s1.id], spotifyTrackOrAlbumUrl: "https://open.spotify.com/track/abc",
    })).rejects.toThrow(/release.*artist/i);
  });

  it("rejects startDate >= endDate", async () => {
    const { a, r, s1 } = await seedArtist();
    await expect(createCampaign({
      artistId: a.id, releaseId: r.id, dailyBudgetCents: 100,
      startDate: "2026-07-01", endDate: "2026-06-01",
      audienceSeedIds: [s1.id], spotifyTrackOrAlbumUrl: "https://open.spotify.com/track/abc",
    })).rejects.toThrow(/startDate.*endDate/i);
  });

  it("rejects missing fb.ad_account_id secret", async () => {
    const [a] = await db.insert(artists).values({ name: "A", spotifyArtistId: `s_nosecret_${Date.now()}_${Math.random()}`, timezone: "UTC" }).returning();
    const [r] = await db.insert(releases).values({
      artistId: a.id, kind: "track", spotifyId: `tr_nosecret_${Date.now()}_${Math.random()}`, title: "T", releaseDate: "2026-06-01",
    }).returning();
    const [s] = await db.insert(audienceSeeds).values({
      artistId: a.id, name: "x", targetingSpec: { geo: { countries: ["US"] } },
    }).returning();
    // NOTE: no setSecret here — but secrets table may have it from a prior test in the same run.
    // We delete it to guarantee absence.
    const { deleteSecret } = await import("@/lib/secrets/mutations");
    await deleteSecret("fb.ad_account_id");
    await expect(createCampaign({
      artistId: a.id, releaseId: r.id, dailyBudgetCents: 100,
      startDate: "2026-06-01", endDate: "2026-07-01",
      audienceSeedIds: [s.id], spotifyTrackOrAlbumUrl: "https://open.spotify.com/track/abc",
    })).rejects.toThrow(/fb\.ad_account_id/);
  });
});

describe("campaign lifecycle", () => {
  it("pause / resume / end flip status + write audit", async () => {
    const { a, r, s1 } = await seedArtist();
    const c = await createCampaign({
      artistId: a.id, releaseId: r.id, dailyBudgetCents: 100,
      startDate: "2026-06-01", endDate: "2026-07-01",
      audienceSeedIds: [s1.id], spotifyTrackOrAlbumUrl: "https://open.spotify.com/track/abc",
    });

    await pauseCampaign(c.id);
    expect((await getCampaign(c.id))?.status).toBe("paused");

    await resumeCampaign(c.id);
    expect((await getCampaign(c.id))?.status).toBe("active");

    await endCampaign(c.id);
    expect((await getCampaign(c.id))?.status).toBe("ended");

    const events = (await listAuditFor("campaign", c.id)).map((x) => x.event);
    expect(events).toContain("paused");
    expect(events).toContain("resumed");
    expect(events).toContain("ended");
  });

  it("pauseCampaign throws on an already-paused campaign", async () => {
    const { a, r, s1 } = await seedArtist();
    const c = await createCampaign({
      artistId: a.id, releaseId: r.id, dailyBudgetCents: 100,
      startDate: "2026-06-01", endDate: "2026-07-01",
      audienceSeedIds: [s1.id], spotifyTrackOrAlbumUrl: "https://open.spotify.com/track/abc",
    });
    await pauseCampaign(c.id);
    await expect(pauseCampaign(c.id)).rejects.toThrow(/cannot pause/);
  });

  it("resumeCampaign throws when not paused", async () => {
    const { a, r, s1 } = await seedArtist();
    const c = await createCampaign({
      artistId: a.id, releaseId: r.id, dailyBudgetCents: 100,
      startDate: "2026-06-01", endDate: "2026-07-01",
      audienceSeedIds: [s1.id], spotifyTrackOrAlbumUrl: "https://open.spotify.com/track/abc",
    });
    // active campaign, can't resume
    await expect(resumeCampaign(c.id)).rejects.toThrow(/cannot resume/);
  });

  it("endCampaign throws on already-ended campaign", async () => {
    const { a, r, s1 } = await seedArtist();
    const c = await createCampaign({
      artistId: a.id, releaseId: r.id, dailyBudgetCents: 100,
      startDate: "2026-06-01", endDate: "2026-07-01",
      audienceSeedIds: [s1.id], spotifyTrackOrAlbumUrl: "https://open.spotify.com/track/abc",
    });
    await endCampaign(c.id);
    await expect(endCampaign(c.id)).rejects.toThrow(/cannot end/);
  });
});

describe("campaign queries", () => {
  it("listCampaigns filters by artistId", async () => {
    const { a, r, s1 } = await seedArtist();
    await createCampaign({
      artistId: a.id, releaseId: r.id, dailyBudgetCents: 100,
      startDate: "2026-06-01", endDate: "2026-07-01",
      audienceSeedIds: [s1.id], spotifyTrackOrAlbumUrl: "https://open.spotify.com/track/abc",
    });
    expect(await listCampaigns({ artistId: a.id })).toHaveLength(1);
    expect(await listCampaigns({ artistId: "00000000-0000-0000-0000-000000000000" })).toHaveLength(0);
  });
});
