"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/current-user";
import { createRelease } from "@/lib/releases/mutations";

export async function createReleaseAction(artistId: string, formData: FormData) {
  if (!(await currentUser())) throw new Error("unauthorized");
  const kind = (formData.get("kind") === "album" ? "album" : "track") as "track" | "album";
  const spotifyId = String(formData.get("spotifyId") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const releaseDate = String(formData.get("releaseDate") ?? "").trim();
  if (!spotifyId || !title || !releaseDate) throw new Error("missing fields");
  await createRelease({ artistId, kind, spotifyId, title, releaseDate });
  revalidatePath(`/artists/${artistId}/releases`);
  redirect(`/artists/${artistId}/releases`);
}
