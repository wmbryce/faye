import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { artists, type Artist } from "@/lib/db/schema";

type CreateInput = {
  name: string;
  spotifyArtistId: string;
  timezone: string;
  fbPageId?: string;
  voiceGuide?: string;
  notes?: string;
};

export async function createArtist(input: CreateInput): Promise<Artist> {
  const [row] = await db.insert(artists).values(input).returning();
  return row;
}

type UpdateInput = Partial<Omit<CreateInput, "spotifyArtistId">> & {
  spotifyForArtistsToken?: string | null;
};

export async function updateArtist(id: string, input: UpdateInput): Promise<void> {
  await db.update(artists).set(input).where(eq(artists.id, id));
}

export async function archiveArtist(id: string): Promise<void> {
  await db.update(artists).set({ archived: true }).where(eq(artists.id, id));
}
