import { and, eq, inArray, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { campaigns, audiences } from "@/lib/db/schema";
import { writeAudit } from "@/lib/audit/log";
import { makeFBClient } from "@/lib/fb/factory";

type CampaignStatus = "draft" | "active" | "paused" | "ended";

// Conditional UPDATE that only flips status when current matches `from`.
// Returns true if exactly one row was updated. Prevents read-check-then-update races.
async function transition(id: string, from: CampaignStatus | CampaignStatus[], to: CampaignStatus): Promise<boolean> {
  const predicate = Array.isArray(from)
    ? inArray(campaigns.status, from)
    : eq(campaigns.status, from);
  const rows = await db
    .update(campaigns)
    .set({ status: to })
    .where(and(eq(campaigns.id, id), predicate))
    .returning({ id: campaigns.id });
  return rows.length === 1;
}

async function currentStatus(id: string): Promise<CampaignStatus | null> {
  const [c] = await db.select({ status: campaigns.status }).from(campaigns).where(eq(campaigns.id, id)).limit(1);
  return (c?.status as CampaignStatus | undefined) ?? null;
}

// Calls fn on each adSetId; records the first error to audit + rethrows after the loop so
// the caller can react. We don't retry — operator can re-run pause/resume manually.
async function fanOut(
  id: string,
  sets: string[],
  fn: (adSetId: string) => Promise<void>,
  failureEvent: string,
): Promise<void> {
  const failed: { adSetId: string; error: string }[] = [];
  const succeeded: string[] = [];
  for (const adSetId of sets) {
    try {
      await fn(adSetId);
      succeeded.push(adSetId);
    } catch (e) {
      failed.push({ adSetId, error: e instanceof Error ? e.message : String(e) });
    }
  }
  if (failed.length > 0) {
    await writeAudit({
      entityType: "campaign",
      entityId: id,
      event: failureEvent,
      payload: { succeeded, failed },
    });
    throw new Error(`${failed.length}/${sets.length} FB ad-set calls failed; see audit ${failureEvent}`);
  }
}

export async function pauseCampaign(id: string): Promise<void> {
  if (!(await transition(id, "active", "paused"))) {
    const s = await currentStatus(id);
    if (!s) throw new Error("campaign not found");
    throw new Error(`cannot pause campaign in status ${s}`);
  }
  const sets = await audienceSetIds(id);
  const fb = await makeFBClient();
  await fanOut(id, sets, (adSetId) => fb.pauseAdSet(adSetId), "pause_failed");
  await writeAudit({ entityType: "campaign", entityId: id, event: "paused" });
}

export async function resumeCampaign(id: string): Promise<void> {
  if (!(await transition(id, "paused", "active"))) {
    const s = await currentStatus(id);
    if (!s) throw new Error("campaign not found");
    throw new Error(`cannot resume campaign in status ${s}`);
  }
  const sets = await audienceSetIds(id);
  const fb = await makeFBClient();
  await fanOut(id, sets, (adSetId) => fb.resumeAdSet(adSetId), "resume_failed");
  await writeAudit({ entityType: "campaign", entityId: id, event: "resumed" });
}

export async function endCampaign(id: string): Promise<void> {
  // Allowed from any status except already-ended.
  const rows = await db
    .update(campaigns)
    .set({ status: "ended" })
    .where(and(eq(campaigns.id, id), ne(campaigns.status, "ended")))
    .returning({ id: campaigns.id });
  if (rows.length !== 1) {
    const s = await currentStatus(id);
    if (!s) throw new Error("campaign not found");
    throw new Error(`cannot end campaign in status ${s}`);
  }
  const sets = await audienceSetIds(id);
  const fb = await makeFBClient();
  await fanOut(id, sets, (adSetId) => fb.pauseAdSet(adSetId), "end_failed");
  await writeAudit({ entityType: "campaign", entityId: id, event: "ended" });
}

async function audienceSetIds(campaignId: string): Promise<string[]> {
  const rows = await db
    .select({ fbAdSetId: audiences.fbAdSetId })
    .from(audiences)
    .where(eq(audiences.campaignId, campaignId));
  return rows.map((r) => r.fbAdSetId).filter((x): x is string => !!x);
}
