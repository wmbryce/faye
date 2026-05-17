import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { auditLog, type AuditLogEntry } from "@/lib/db/schema";

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
