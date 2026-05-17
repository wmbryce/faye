"use server";
import { revalidatePath } from "next/cache";
import { currentUser } from "@/lib/auth/current-user";
import { approvePendingAd, rejectPendingAd } from "@/lib/ads/mutations";

async function requireUser() {
  if (!(await currentUser())) throw new Error("unauthorized");
}

export async function approveAction(campaignId: string, adId: string) {
  await requireUser();
  await approvePendingAd(adId);
  revalidatePath(`/campaigns/${campaignId}/review`);
  revalidatePath(`/campaigns/${campaignId}`);
}

export async function rejectAction(campaignId: string, adId: string) {
  await requireUser();
  await rejectPendingAd(adId);
  revalidatePath(`/campaigns/${campaignId}/review`);
  revalidatePath(`/campaigns/${campaignId}`);
}
