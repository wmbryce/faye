import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { auditLog, type AuditLogEntry } from "@/lib/db/schema";

export async function listAuditFor(
  entityType: string,
  entityId: string,
  opts?: { limit?: number },
): Promise<AuditLogEntry[]> {
  return db
    .select()
    .from(auditLog)
    .where(and(eq(auditLog.entityType, entityType), eq(auditLog.entityId, entityId)))
    .orderBy(desc(auditLog.createdAt))
    .limit(opts?.limit ?? 200);
}
