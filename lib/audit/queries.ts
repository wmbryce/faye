import { and, desc, eq, inArray, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { ads, auditLog, type AuditLogEntry } from "@/lib/db/schema";

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 500;

export async function listAuditFor(
  entityType: string,
  entityId: string,
  opts?: { limit?: number },
): Promise<AuditLogEntry[]> {
  const raw = opts?.limit;
  const parsed = Number.isFinite(raw) ? Math.floor(raw!) : NaN;
  const limit = parsed > 0 ? Math.min(parsed, MAX_LIMIT) : DEFAULT_LIMIT;
  return db
    .select()
    .from(auditLog)
    .where(and(eq(auditLog.entityType, entityType), eq(auditLog.entityId, entityId)))
    .orderBy(desc(auditLog.createdAt))
    .limit(limit);
}

export async function listAuditForCampaignAndAds(campaignId: string, limit = 500): Promise<AuditLogEntry[]> {
  const adIds = (await db.select({ id: ads.id }).from(ads).where(eq(ads.campaignId, campaignId))).map((a) => a.id);
  const conditions: ReturnType<typeof and>[] = [
    and(eq(auditLog.entityType, "campaign"), eq(auditLog.entityId, campaignId))!,
  ];
  if (adIds.length > 0) {
    conditions.push(and(eq(auditLog.entityType, "ad"), inArray(auditLog.entityId, adIds))!);
  }
  return db
    .select()
    .from(auditLog)
    .where(or(...conditions))
    .orderBy(desc(auditLog.createdAt))
    .limit(limit);
}
