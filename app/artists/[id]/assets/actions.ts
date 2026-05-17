"use server";
import { revalidatePath } from "next/cache";
import { currentUser } from "@/lib/auth/current-user";
import { uploadAsset, deleteAsset, updateAssetLabel } from "@/lib/assets/mutations";
import { getAsset } from "@/lib/assets/queries";

const MAX_BYTES = 25 * 1024 * 1024;

const ALLOWED_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/webm",
  "video/quicktime",
]);

export async function uploadAssetAction(artistId: string, formData: FormData) {
  if (!(await currentUser())) throw new Error("unauthorized");
  const file = formData.get("file");
  if (!(file instanceof File)) throw new Error("no file");
  if (file.size > MAX_BYTES) throw new Error("file too large (25MB max)");
  if (!ALLOWED_MIME.has(file.type)) throw new Error(`unsupported content-type: ${file.type}`);
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
  const asset = await getAsset(assetId);
  if (!asset || asset.artistId !== artistId) throw new Error("not found");
  await deleteAsset(assetId);
  revalidatePath(`/artists/${artistId}/assets`);
}

export async function updateAssetLabelAction(artistId: string, assetId: string, formData: FormData) {
  if (!(await currentUser())) throw new Error("unauthorized");
  const asset = await getAsset(assetId);
  if (!asset || asset.artistId !== artistId) throw new Error("not found");
  await updateAssetLabel(assetId, String(formData.get("label") ?? ""));
  revalidatePath(`/artists/${artistId}/assets`);
}
