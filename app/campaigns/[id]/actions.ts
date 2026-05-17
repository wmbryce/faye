"use server";
import { revalidatePath } from "next/cache";
import { currentUser } from "@/lib/auth/current-user";
import { pauseCampaign, resumeCampaign, endCampaign } from "@/lib/campaigns/lifecycle";

async function requireUser() {
  if (!(await currentUser())) throw new Error("unauthorized");
}

export async function pauseCampaignAction(campaignId: string) {
  await requireUser();
  await pauseCampaign(campaignId);
  revalidatePath(`/campaigns/${campaignId}`);
  revalidatePath("/campaigns");
}

export async function resumeCampaignAction(campaignId: string) {
  await requireUser();
  await resumeCampaign(campaignId);
  revalidatePath(`/campaigns/${campaignId}`);
  revalidatePath("/campaigns");
}

export async function endCampaignAction(campaignId: string) {
  await requireUser();
  await endCampaign(campaignId);
  revalidatePath(`/campaigns/${campaignId}`);
  revalidatePath("/campaigns");
}
