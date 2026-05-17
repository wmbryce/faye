"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { currentUser } from "@/lib/auth/current-user";
import { createDraftAd, publishAd } from "@/lib/ads/mutations";

export async function createAdAction(campaignId: string, formData: FormData) {
  if (!(await currentUser())) throw new Error("unauthorized");

  const audienceId = String(formData.get("audienceId") ?? "").trim();
  const assetId = String(formData.get("assetId") ?? "").trim();
  const copyHeadline = String(formData.get("copyHeadline") ?? "").trim();
  const copyPrimaryText = String(formData.get("copyPrimaryText") ?? "").trim();
  const copyBody = String(formData.get("copyBody") ?? "").trim();
  const action = String(formData.get("_action") ?? "save");

  if (!audienceId) throw new Error("audienceId required");
  if (!assetId) throw new Error("assetId required");

  const ad = await createDraftAd({
    campaignId,
    audienceId,
    assetId,
    copyHeadline,
    copyPrimaryText,
    copyBody,
  });

  if (action === "publish") {
    await publishAd(ad.id);
  }

  revalidatePath(`/campaigns/${campaignId}`);
  revalidatePath(`/campaigns/${campaignId}/ads`);
  redirect(`/campaigns/${campaignId}`);
}
