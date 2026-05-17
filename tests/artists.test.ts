import { describe, it, expect } from "vitest";
import { db } from "@/lib/db";
import { artists } from "@/lib/db/schema";

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
