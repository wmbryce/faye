import { describe, it, expect } from "vitest";
import { db } from "@/lib/db";
import { artists } from "@/lib/db/schema";
import { listArtists, getArtist, getArtistBySpotifyId } from "@/lib/artists/queries";
import { createArtist, updateArtist, archiveArtist } from "@/lib/artists/mutations";

describe("artists schema", () => {
  it("inserts an artist", async () => {
    const [a] = await db.insert(artists).values({
      name: "Test Artist",
      spotifyArtistId: "spot_123",
      timezone: "America/Denver",
    }).returning();
    expect(a.name).toBe("Test Artist");
    expect(a.archived).toBe(false);
  });
});

describe("artist crud", () => {
  it("creates and lists", async () => {
    await createArtist({ name: "A", spotifyArtistId: "s1", timezone: "UTC" });
    await createArtist({ name: "B", spotifyArtistId: "s2", timezone: "UTC" });
    const rows = await listArtists();
    expect(rows.map((a) => a.name).sort()).toEqual(["A", "B"]);
  });

  it("gets by id and by spotify id", async () => {
    const a = await createArtist({ name: "A", spotifyArtistId: "s1", timezone: "UTC" });
    expect((await getArtist(a.id))?.name).toBe("A");
    expect((await getArtistBySpotifyId("s1"))?.id).toBe(a.id);
  });

  it("updates voice guide", async () => {
    const a = await createArtist({ name: "A", spotifyArtistId: "s1", timezone: "UTC" });
    await updateArtist(a.id, { voiceGuide: "warm + earnest" });
    expect((await getArtist(a.id))?.voiceGuide).toBe("warm + earnest");
  });

  it("archive hides from default list", async () => {
    const a = await createArtist({ name: "A", spotifyArtistId: "s1", timezone: "UTC" });
    await archiveArtist(a.id);
    expect((await listArtists()).find((x) => x.id === a.id)).toBeUndefined();
    expect((await listArtists({ includeArchived: true })).find((x) => x.id === a.id)).toBeTruthy();
  });
});
