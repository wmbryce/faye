import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { artists, type Artist } from "@/lib/db/schema";

export async function listArtists(opts?: { includeArchived?: boolean }): Promise<Artist[]> {
  if (opts?.includeArchived) return db.select().from(artists);
  return db.select().from(artists).where(eq(artists.archived, false));
}

export async function getArtist(
  id: string,
  opts?: { includeArchived?: boolean },
): Promise<Artist | null> {
  const where = opts?.includeArchived
    ? eq(artists.id, id)
    : and(eq(artists.id, id), eq(artists.archived, false));
  const [a] = await db.select().from(artists).where(where).limit(1);
  return a ?? null;
}

export async function getArtistBySpotifyId(
  spotifyId: string,
  opts?: { includeArchived?: boolean },
): Promise<Artist | null> {
  const where = opts?.includeArchived
    ? eq(artists.spotifyArtistId, spotifyId)
    : and(eq(artists.spotifyArtistId, spotifyId), eq(artists.archived, false));
  const [a] = await db.select().from(artists).where(where).limit(1);
  return a ?? null;
}
