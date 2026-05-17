import { describe, it, expect } from "vitest";
import { db } from "@/lib/db";
import { artists } from "@/lib/db/schema";
import { createRelease } from "@/lib/releases/mutations";
import { listReleases } from "@/lib/releases/queries";

describe("releases", () => {
  it("creates and lists for artist", async () => {
    const [a] = await db.insert(artists).values({ name: "A", spotifyArtistId: "s1", timezone: "UTC" }).returning();
    await createRelease({ artistId: a.id, kind: "track", spotifyId: "tr1", title: "Song", releaseDate: "2026-01-01" });
    await createRelease({ artistId: a.id, kind: "album", spotifyId: "al1", title: "LP", releaseDate: "2026-02-01" });
    const rows = await listReleases(a.id);
    expect(rows.map((r) => r.title).sort()).toEqual(["LP", "Song"]);
  });
});
