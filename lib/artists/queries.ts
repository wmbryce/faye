import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { artists, type Artist } from "@/lib/db/schema";

export async function listArtists(opts?: { includeArchived?: boolean }): Promise<Artist[]> {
  if (opts?.includeArchived) return db.select().from(artists);
  return db.select().from(artists).where(eq(artists.archived, false));
}

export async function getArtist(id: string): Promise<Artist | null> {
  const [a] = await db.select().from(artists).where(eq(artists.id, id)).limit(1);
  return a ?? null;
}

export async function getArtistBySpotifyId(spotifyId: string): Promise<Artist | null> {
  const [a] = await db.select().from(artists).where(eq(artists.spotifyArtistId, spotifyId)).limit(1);
  return a ?? null;
}
