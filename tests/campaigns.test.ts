import { describe, it, expect } from "vitest";
import { db } from "@/lib/db";
import { artists, releases, campaigns } from "@/lib/db/schema";

describe("campaigns schema", () => {
  it("inserts a campaign and respects defaults", async () => {
    const [a] = await db.insert(artists).values({ name: "A", spotifyArtistId: "s1", timezone: "UTC" }).returning();
    const [r] = await db.insert(releases).values({
      artistId: a.id, kind: "track", spotifyId: "tr1", title: "Song", releaseDate: "2026-01-01",
    }).returning();
    const [c] = await db.insert(campaigns).values({
      artistId: a.id,
      releaseId: r.id,
      dailyBudgetCents: 1000,
      startDate: "2026-06-01",
      endDate: "2026-07-01",
      timezone: "UTC",
    }).returning();
    expect(c.status).toBe("draft");
    expect(c.dailyBudgetCents).toBe(1000);
  });
});
