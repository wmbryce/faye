"use server";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { ads } from "@/lib/db/schema";
import { verifyRejectToken, consumeRejectToken } from "@/lib/email/reject-tokens";
import { writeAudit } from "@/lib/audit/log";

export async function rejectAdAction(token: string) {
  const v = await verifyRejectToken(token);
  if (!v.ok) redirect(`/reject/done?status=${v.reason}`);
  // Mark rejected. If the ad's already in another terminal status (published/rejected/killed),
  // still mark + consume the nonce — operator clicked, we owe them feedback.
  await db.update(ads).set({
    status: "rejected",
    rejectedAt: new Date(),
    rejectedReason: "operator",
  }).where(eq(ads.id, v.adId));
  await consumeRejectToken({ nonce: v.nonce, adId: v.adId });
  await writeAudit({
    entityType: "ad",
    entityId: v.adId,
    event: "rejected_via_email",
  });
  redirect(`/reject/done?status=ok`);
}
