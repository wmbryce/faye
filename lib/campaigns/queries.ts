import { eq, desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { campaigns, audiences, type Campaign, type Audience } from "@/lib/db/schema";

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
