import { eq } from "drizzle-orm";
import { basename } from "node:path";
import { db } from "@/lib/db";
import { assets, type Asset } from "@/lib/db/schema";
import { saveBuffer, deleteFile } from "./storage";

export async function uploadAsset(args: {
  artistId: string;
  file: { buffer: Buffer; contentType: string; origName: string; bytes: number };
  label?: string;
}): Promise<Asset> {
  const kind = args.file.contentType.startsWith("video/") ? "video" : "image";
  const { url, filename } = await saveBuffer(args.file);
  try {
    const [row] = await db.insert(assets).values({
      artistId: args.artistId,
      kind,
      url,
      label: args.label ?? "",
      bytes: args.file.bytes,
      contentType: args.file.contentType,
    }).returning();
    return row;
  } catch (err) {
    // Roll back the file write so we don't accumulate orphaned blobs on disk.
    await deleteFile(filename).catch(() => undefined);
    throw err;
  }
}

export async function deleteAsset(id: string): Promise<void> {
  const [row] = await db.select().from(assets).where(eq(assets.id, id)).limit(1);
  if (!row) return;
  await db.delete(assets).where(eq(assets.id, id));
  const filename = basename(row.url);
  await deleteFile(filename);
}

export async function updateAssetLabel(id: string, label: string): Promise<void> {
  await db.update(assets).set({ label }).where(eq(assets.id, id));
}
