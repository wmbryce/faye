import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { campaigns, audiences } from "@/lib/db/schema";
import { writeAudit } from "@/lib/audit/log";
import { makeFBClient } from "@/lib/fb/factory";

export async function pauseCampaign(id: string): Promise<void> {
  const sets = await audienceSetIds(id);
  const fb = await makeFBClient();
  for (const adSetId of sets) await fb.pauseAdSet(adSetId);
  await db.update(campaigns).set({ status: "paused" }).where(eq(campaigns.id, id));
  await writeAudit({ entityType: "campaign", entityId: id, event: "paused" });
}

export async function resumeCampaign(id: string): Promise<void> {
  const sets = await audienceSetIds(id);
  const fb = await makeFBClient();
  for (const adSetId of sets) await fb.resumeAdSet(adSetId);
  await db.update(campaigns).set({ status: "active" }).where(eq(campaigns.id, id));
  await writeAudit({ entityType: "campaign", entityId: id, event: "resumed" });
}

export async function endCampaign(id: string): Promise<void> {
  const sets = await audienceSetIds(id);
  const fb = await makeFBClient();
  for (const adSetId of sets) await fb.pauseAdSet(adSetId);
  await db.update(campaigns).set({ status: "ended" }).where(eq(campaigns.id, id));
  await writeAudit({ entityType: "campaign", entityId: id, event: "ended" });
}

async function audienceSetIds(campaignId: string): Promise<string[]> {
  const rows = await db
    .select({ fbAdSetId: audiences.fbAdSetId })
    .from(audiences)
    .where(eq(audiences.campaignId, campaignId));
  return rows.map((r) => r.fbAdSetId).filter((x): x is string => !!x);
}
