"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/current-user";
import { createRelease } from "@/lib/releases/mutations";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function createReleaseAction(artistId: string, formData: FormData) {
  if (!(await currentUser())) throw new Error("unauthorized");

  const kindRaw = String(formData.get("kind") ?? "").trim();
  if (kindRaw !== "track" && kindRaw !== "album") throw new Error("invalid kind");
  const kind = kindRaw;

  const spotifyId = String(formData.get("spotifyId") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const releaseDate = String(formData.get("releaseDate") ?? "").trim();
  if (!spotifyId || !title || !releaseDate) throw new Error("missing fields");

  // Round-trip-validate the date to reject non-calendar dates like 2026-02-31.
  if (!ISO_DATE.test(releaseDate)) {
    throw new Error("releaseDate must be a valid YYYY-MM-DD date");
  }
  const parsed = new Date(`${releaseDate}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== releaseDate) {
    throw new Error("releaseDate must be a valid YYYY-MM-DD date");
  }

  await createRelease({ artistId, kind, spotifyId, title, releaseDate });
  revalidatePath(`/artists/${artistId}/releases`);
  redirect(`/artists/${artistId}/releases`);
}
