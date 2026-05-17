"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { currentUser } from "@/lib/auth/current-user";
import { createCampaign } from "@/lib/campaigns/mutations";

export async function createCampaignAction(artistId: string, formData: FormData) {
  if (!(await currentUser())) throw new Error("unauthorized");

  const releaseId = String(formData.get("releaseId") ?? "").trim();
  const spotifyTrackOrAlbumUrl = String(formData.get("spotifyTrackOrAlbumUrl") ?? "").trim();
  const dailyBudgetDollarsRaw = String(formData.get("dailyBudgetDollars") ?? "").trim();
  const startDate = String(formData.get("startDate") ?? "").trim();
  const endDate = String(formData.get("endDate") ?? "").trim();
  const audienceSeedIds = formData.getAll("audienceSeedIds").map((x) => String(x)).filter(Boolean);

  if (!releaseId) throw new Error("releaseId required");
  if (!spotifyTrackOrAlbumUrl) throw new Error("spotifyTrackOrAlbumUrl required");
  if (!startDate || !endDate) throw new Error("startDate and endDate required");
  const dollars = Number(dailyBudgetDollarsRaw);
  if (!Number.isFinite(dollars) || dollars <= 0) throw new Error("dailyBudget must be > 0");
  const dailyBudgetCents = Math.round(dollars * 100);

  const c = await createCampaign({
    artistId,
    releaseId,
    spotifyTrackOrAlbumUrl,
    dailyBudgetCents,
    startDate,
    endDate,
    audienceSeedIds,
  });
  revalidatePath("/campaigns");
  revalidatePath(`/artists/${artistId}`);
  redirect(`/campaigns/${c.id}`);
}
