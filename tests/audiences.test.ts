import { describe, it, expect } from "vitest";
import { db } from "@/lib/db";
import { artists } from "@/lib/db/schema";
import { createAudienceSeed, archiveAudienceSeed } from "@/lib/audiences/mutations";
import { listAudienceSeeds } from "@/lib/audiences/queries";

describe("audience seeds", () => {
  it("create + list filters archived", async () => {
    const [a] = await db.insert(artists).values({ name: "A", spotifyArtistId: "s1", timezone: "UTC" }).returning();
    const s = await createAudienceSeed({
      artistId: a.id,
      name: "indie folk us25-44",
      targetingSpec: { geo: { countries: ["US"] }, age_min: 25, age_max: 44, interests: ["indie folk"] },
    });
    expect((await listAudienceSeeds(a.id)).map((x) => x.name)).toEqual(["indie folk us25-44"]);
    await archiveAudienceSeed({ artistId: a.id, seedId: s.id });
    expect(await listAudienceSeeds(a.id)).toHaveLength(0);
    expect(await listAudienceSeeds(a.id, { includeArchived: true })).toHaveLength(1);
  });

  it("rejects invalid targeting spec (zod)", async () => {
    const [a] = await db.insert(artists).values({ name: "A", spotifyArtistId: "s1", timezone: "UTC" }).returning();
    await expect(
      createAudienceSeed({ artistId: a.id, name: "bad", targetingSpec: { wrongKey: 1 } as any })
    ).rejects.toThrow();
  });

  it("archive scoped to artist: rejects cross-artist archive", async () => {
    const [a1] = await db.insert(artists).values({ name: "A1", spotifyArtistId: "s1", timezone: "UTC" }).returning();
    const [a2] = await db.insert(artists).values({ name: "A2", spotifyArtistId: "s2", timezone: "UTC" }).returning();
    const s = await createAudienceSeed({
      artistId: a1.id,
      name: "seed",
      targetingSpec: { geo: { countries: ["US"] } },
    });
    await expect(archiveAudienceSeed({ artistId: a2.id, seedId: s.id })).rejects.toThrow();
    // still active for the real owner
    expect(await listAudienceSeeds(a1.id)).toHaveLength(1);
  });

  it("rejects inverted age range", async () => {
    const [a] = await db.insert(artists).values({ name: "A", spotifyArtistId: "s1", timezone: "UTC" }).returning();
    await expect(
      createAudienceSeed({
        artistId: a.id,
        name: "bad-age",
        targetingSpec: { geo: { countries: ["US"] }, age_min: 40, age_max: 18 },
      })
    ).rejects.toThrow();
  });
});
