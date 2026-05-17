import { eq } from "drizzle-orm";
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

export async function archiveAudienceSeed(id: string): Promise<void> {
  await db.update(audienceSeeds).set({ archived: true }).where(eq(audienceSeeds.id, id));
}
