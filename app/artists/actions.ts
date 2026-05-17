"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/current-user";
import { createArtist, updateArtist, archiveArtist } from "@/lib/artists/mutations";

async function requireUser() {
  const u = await currentUser();
  if (!u) throw new Error("unauthorized");
}

export async function createArtistAction(formData: FormData) {
  await requireUser();
  const name = String(formData.get("name") ?? "").trim();
  const spotifyArtistId = String(formData.get("spotifyArtistId") ?? "").trim();
  const timezone = String(formData.get("timezone") ?? "America/Denver");
  const voiceGuide = String(formData.get("voiceGuide") ?? "");
  if (!name || !spotifyArtistId) throw new Error("name + spotifyArtistId required");
  const a = await createArtist({ name, spotifyArtistId, timezone, voiceGuide });
  revalidatePath("/artists");
  redirect(`/artists/${a.id}`);
}

export async function updateArtistAction(id: string, formData: FormData) {
  await requireUser();
  const name = String(formData.get("name") ?? "").trim();
  const timezone = String(formData.get("timezone") ?? "");
  const voiceGuide = String(formData.get("voiceGuide") ?? "");
  const fbPageId = String(formData.get("fbPageId") ?? "") || undefined;
  await updateArtist(id, { name, timezone, voiceGuide, fbPageId });
  revalidatePath(`/artists/${id}`);
  redirect(`/artists/${id}`);
}

export async function archiveArtistAction(id: string) {
  await requireUser();
  await archiveArtist(id);
  revalidatePath("/artists");
  redirect("/artists");
}
