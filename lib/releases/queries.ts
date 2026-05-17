import { eq, desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { releases, type Release } from "@/lib/db/schema";

export async function listReleases(artistId: string): Promise<Release[]> {
  return db.select().from(releases).where(eq(releases.artistId, artistId)).orderBy(desc(releases.releaseDate));
}

export async function getRelease(id: string): Promise<Release | null> {
  const [r] = await db.select().from(releases).where(eq(releases.id, id)).limit(1);
  return r ?? null;
}
