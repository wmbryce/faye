import { db } from "@/lib/db";
import { releases, type Release } from "@/lib/db/schema";

export async function createRelease(input: {
  artistId: string;
  kind: "track" | "album";
  spotifyId: string;
  title: string;
  releaseDate: string;
}): Promise<Release> {
  const [row] = await db.insert(releases).values(input).returning();
  return row;
}
