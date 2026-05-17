"use server";
import { redirect } from "next/navigation";
import { verifyRejectToken, consumeRejectToken } from "@/lib/email/reject-tokens";
import { markAdRejected } from "@/lib/ads/mutations";

export async function rejectAdAction(token: string) {
  const v = await verifyRejectToken(token);
  if (!v.ok) redirect(`/reject/done?status=${v.reason}`);
  // Mark rejected. If the ad's already in another terminal status (published/rejected/killed),
  // still mark + consume the nonce — operator clicked, we owe them feedback.
  await markAdRejected(v.adId, "operator", "email");
  await consumeRejectToken({ nonce: v.nonce, adId: v.adId });
  redirect(`/reject/done?status=ok`);
}
