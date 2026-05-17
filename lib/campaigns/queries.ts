import { eq, desc } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { campaigns, audiences, type Campaign, type Audience } from "@/lib/db/schema";
import { getArtist } from "@/lib/artists/queries";
import { getRelease } from "@/lib/releases/queries";
import type { Artist } from "@/lib/db/schema";
import type { Release } from "@/lib/db/schema";

export async function listCampaigns(opts?: { artistId?: string }): Promise<Campaign[]> {
  const base = db.select().from(campaigns);
  const rows = opts?.artistId
    ? await base.where(eq(campaigns.artistId, opts.artistId)).orderBy(desc(campaigns.createdAt))
    : await base.orderBy(desc(campaigns.createdAt));
  return rows;
}

export async function getCampaign(id: string): Promise<Campaign | null> {
  const [c] = await db.select().from(campaigns).where(eq(campaigns.id, id)).limit(1);
  return c ?? null;
}

export async function listAudiencesForCampaign(campaignId: string): Promise<Audience[]> {
  return db.select().from(audiences).where(eq(audiences.campaignId, campaignId));
}

export type CampaignContext = { campaign: Campaign; artist: Artist; release: Release };

/**
 * Convenience: fetch campaign + artist + release in parallel. Calls notFound()
 * (throws) when any are missing — pages can use this and skip the null checks.
 */
export async function getCampaignContext(campaignId: string): Promise<CampaignContext> {
  const campaign = await getCampaign(campaignId);
  if (!campaign) notFound();
  const [artist, release] = await Promise.all([
    getArtist(campaign.artistId),
    getRelease(campaign.releaseId),
  ]);
  if (!artist || !release) notFound();
  return { campaign, artist, release };
}
