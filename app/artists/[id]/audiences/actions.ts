"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/current-user";
import { createAudienceSeed, archiveAudienceSeed } from "@/lib/audiences/mutations";

export async function createSeedAction(artistId: string, formData: FormData) {
  if (!(await currentUser())) throw new Error("unauthorized");
  const name = String(formData.get("name") ?? "").trim();
  const rawJson = String(formData.get("targetingSpec") ?? "");
  let spec: unknown;
  try { spec = JSON.parse(rawJson); } catch { throw new Error("invalid JSON"); }
  await createAudienceSeed({ artistId, name, targetingSpec: spec });
  revalidatePath(`/artists/${artistId}/audiences`);
  redirect(`/artists/${artistId}/audiences`);
}

export async function archiveSeedAction(artistId: string, seedId: string) {
  if (!(await currentUser())) throw new Error("unauthorized");
  await archiveAudienceSeed(seedId);
  revalidatePath(`/artists/${artistId}/audiences`);
}
