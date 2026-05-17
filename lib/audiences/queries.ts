import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { audienceSeeds, type AudienceSeed } from "@/lib/db/schema";

export async function listAudienceSeeds(artistId: string, opts?: { includeArchived?: boolean }): Promise<AudienceSeed[]> {
  if (opts?.includeArchived) {
    return db.select().from(audienceSeeds).where(eq(audienceSeeds.artistId, artistId));
  }
  return db.select().from(audienceSeeds).where(
    and(eq(audienceSeeds.artistId, artistId), eq(audienceSeeds.archived, false))
  );
}

export async function getAudienceSeed(id: string): Promise<AudienceSeed | null> {
  const [s] = await db.select().from(audienceSeeds).where(eq(audienceSeeds.id, id)).limit(1);
  return s ?? null;
}
