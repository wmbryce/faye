import { eq, desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { assets, type Asset } from "@/lib/db/schema";

export async function listAssets(artistId: string): Promise<Asset[]> {
  return db.select().from(assets).where(eq(assets.artistId, artistId)).orderBy(desc(assets.createdAt));
}

export async function getAsset(id: string): Promise<Asset | null> {
  const [a] = await db.select().from(assets).where(eq(assets.id, id)).limit(1);
  return a ?? null;
}
