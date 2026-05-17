"use server";
import { redirect } from "next/navigation";
import { verifyRejectToken, consumeRejectToken } from "@/lib/email/reject-tokens";
import { markAdRejected } from "@/lib/ads/mutations";

export async function rejectAdAction(token: string) {
  const v = await verifyRejectToken(token);
  if (!v.ok) redirect(`/reject/done?status=${v.reason}`);
  // Consume the nonce FIRST so concurrent requests / back-button retries can't
  // both pass verify and then both call markAdRejected. Only the request that
  // wins the insert proceeds to mutate. markAdRejected itself is now guarded so
  // it only flips status for draft/pending ads — already-published/killed ads
  // are recorded as a no-op audit and the operator still gets confirmation.
  const fresh = await consumeRejectToken({ nonce: v.nonce, adId: v.adId });
  if (!fresh) redirect(`/reject/done?status=already_used`);
  await markAdRejected(v.adId, "operator", "email");
  redirect(`/reject/done?status=ok`);
}
