import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { audienceSeeds, type AudienceSeed } from "@/lib/db/schema";
import { TargetingSpec } from "./spec";

export async function createAudienceSeed(input: {
  artistId: string;
  name: string;
  targetingSpec: unknown;
}): Promise<AudienceSeed> {
  const spec = TargetingSpec.parse(input.targetingSpec);
  const [row] = await db.insert(audienceSeeds).values({
    artistId: input.artistId,
    name: input.name,
    targetingSpec: spec,
  }).returning();
  return row;
}

/**
 * Archives a seed only if it belongs to the given artist. Throws if no row matched —
 * either the seed doesn't exist or it belongs to another artist.
 */
export async function archiveAudienceSeed(input: {
  artistId: string;
  seedId: string;
}): Promise<void> {
  const updated = await db
    .update(audienceSeeds)
    .set({ archived: true })
    .where(and(eq(audienceSeeds.id, input.seedId), eq(audienceSeeds.artistId, input.artistId)))
    .returning({ id: audienceSeeds.id });
  if (updated.length === 0) throw new Error("seed not found for this artist");
}
