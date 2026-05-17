import { db } from "@/lib/db";
import { auditLog } from "@/lib/db/schema";

export async function writeAudit(args: {
  entityType: string;
  entityId: string;
  event: string;
  payload?: unknown;
}): Promise<void> {
  await db.insert(auditLog).values({
    entityType: args.entityType,
    entityId: args.entityId,
    event: args.event,
    payload: args.payload ?? null,
  });
}
