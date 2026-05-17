"use server";
import { revalidatePath } from "next/cache";
import { currentUser } from "@/lib/auth/current-user";
import { uploadAsset, deleteAsset, updateAssetLabel } from "@/lib/assets/mutations";

const MAX_BYTES = 25 * 1024 * 1024;

export async function uploadAssetAction(artistId: string, formData: FormData) {
  if (!(await currentUser())) throw new Error("unauthorized");
  const file = formData.get("file");
  if (!(file instanceof File)) throw new Error("no file");
  if (file.size > MAX_BYTES) throw new Error("file too large (25MB max)");
  const buf = Buffer.from(await file.arrayBuffer());
  await uploadAsset({
    artistId,
    file: { buffer: buf, contentType: file.type, origName: file.name, bytes: file.size },
    label: String(formData.get("label") ?? ""),
  });
  revalidatePath(`/artists/${artistId}/assets`);
}

export async function deleteAssetAction(artistId: string, assetId: string) {
  if (!(await currentUser())) throw new Error("unauthorized");
  await deleteAsset(assetId);
  revalidatePath(`/artists/${artistId}/assets`);
}

export async function updateAssetLabelAction(artistId: string, assetId: string, formData: FormData) {
  if (!(await currentUser())) throw new Error("unauthorized");
  await updateAssetLabel(assetId, String(formData.get("label") ?? ""));
  revalidatePath(`/artists/${artistId}/assets`);
}
