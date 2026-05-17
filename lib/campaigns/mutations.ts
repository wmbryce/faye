import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { campaigns, audiences, type Campaign } from "@/lib/db/schema";
import { writeAudit } from "@/lib/audit/log";
import { makeFBClient } from "@/lib/fb/factory";
import { makeSmartlinkClient } from "@/lib/smartlink/factory";
import { getSecret } from "@/lib/secrets/queries";
import { getArtist } from "@/lib/artists/queries";
import { getRelease } from "@/lib/releases/queries";
import { getAudienceSeed } from "@/lib/audiences/queries";

export type CreateCampaignInput = {
  artistId: string;
  releaseId: string;
  dailyBudgetCents: number;
  startDate: string; // YYYY-MM-DD
  endDate: string;
  audienceSeedIds: string[];
  spotifyTrackOrAlbumUrl: string;
};

const MAX_AUDIENCES_PER_CAMPAIGN = 5;

function parseIsoDate(value: string, field: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`${field} must be YYYY-MM-DD`);
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) throw new Error(`${field} is not a valid date`);
  return d;
}

export async function createCampaign(input: CreateCampaignInput): Promise<Campaign> {
  if (input.audienceSeedIds.length === 0 || input.audienceSeedIds.length > MAX_AUDIENCES_PER_CAMPAIGN) {
    throw new Error(`must pick 1-${MAX_AUDIENCES_PER_CAMPAIGN} audience seeds`);
  }
  if (input.dailyBudgetCents <= 0) throw new Error("dailyBudgetCents must be > 0");
  if (input.dailyBudgetCents < input.audienceSeedIds.length) {
    throw new Error("dailyBudgetCents must be at least 1 cent per audience");
  }
  const startAt = parseIsoDate(input.startDate, "startDate");
  const endAt = parseIsoDate(input.endDate, "endDate");
  if (startAt >= endAt) throw new Error("startDate must be before endDate");

  const [artist, release] = await Promise.all([getArtist(input.artistId), getRelease(input.releaseId)]);
  if (!artist) throw new Error("artist not found");
  if (!release) throw new Error("release not found");
  if (release.artistId !== input.artistId) throw new Error("release does not belong to artist");

  // Validate all seeds belong to this artist
  const seeds = await Promise.all(input.audienceSeedIds.map((id) => getAudienceSeed(id)));
  for (let i = 0; i < seeds.length; i++) {
    const s = seeds[i];
    if (!s || s.artistId !== input.artistId) {
      throw new Error(`audience seed ${input.audienceSeedIds[i]} not found or wrong artist`);
    }
  }

  const [campaign] = await db.insert(campaigns).values({
    artistId: input.artistId,
    releaseId: input.releaseId,
    dailyBudgetCents: input.dailyBudgetCents,
    startDate: input.startDate,
    endDate: input.endDate,
    timezone: artist.timezone,
    status: "draft",
  }).returning();
  await writeAudit({ entityType: "campaign", entityId: campaign.id, event: "draft_created" });

  const fb = await makeFBClient();
  const sl = await makeSmartlinkClient();
  const adAccountId = await getSecret("fb.ad_account_id");
  if (!adAccountId) throw new Error("missing secret fb.ad_account_id (set in /settings)");

  const fbCamp = await fb.createCampaign({
    adAccountId,
    name: `${artist.name} — ${release.title}`,
    objective: "OUTCOME_TRAFFIC",
    status: "PAUSED",
  });
  await db.update(campaigns).set({ fbCampaignId: fbCamp.id }).where(eq(campaigns.id, campaign.id));
  await writeAudit({
    entityType: "campaign", entityId: campaign.id, event: "fb_campaign_created",
    payload: { fbCampaignId: fbCamp.id },
  });

  const smartlink = await sl.create({
    artistName: artist.name,
    releaseTitle: release.title,
    spotifyTrackOrAlbumUrl: input.spotifyTrackOrAlbumUrl,
  });
  await db.update(campaigns).set({
    smartlinkId: smartlink.id,
    smartlinkUrl: smartlink.shortUrl,
  }).where(eq(campaigns.id, campaign.id));
  await writeAudit({
    entityType: "campaign", entityId: campaign.id, event: "smartlink_created",
    payload: { id: smartlink.id, url: smartlink.shortUrl },
  });

  const perAudienceBudget = Math.floor(input.dailyBudgetCents / input.audienceSeedIds.length);
  for (const seed of seeds) {
    if (!seed) continue; // guarded above
    const fbAdSet = await fb.createAdSet({
      adAccountId,
      campaignId: fbCamp.id,
      name: seed.name,
      dailyBudgetCents: perAudienceBudget,
      targetingSpec: seed.targetingSpec,
      optimization: "LINK_CLICKS",
      startTime: startAt,
      endTime: endAt,
      status: "PAUSED",
    });
    await db.insert(audiences).values({
      campaignId: campaign.id,
      seedId: seed.id,
      name: seed.name,
      fbTargetingSpec: seed.targetingSpec,
      fbAdSetId: fbAdSet.id,
      dailyBudgetCents: perAudienceBudget,
    });
    await writeAudit({
      entityType: "campaign", entityId: campaign.id, event: "audience_created",
      payload: { seedId: seed.id, fbAdSetId: fbAdSet.id },
    });
  }

  await db.update(campaigns).set({ status: "active" }).where(eq(campaigns.id, campaign.id));
  await writeAudit({ entityType: "campaign", entityId: campaign.id, event: "activated" });

  const [fresh] = await db.select().from(campaigns).where(eq(campaigns.id, campaign.id));
  return fresh;
}
