import { describe, it, expect } from "vitest";
import { db } from "@/lib/db";
import { artists, releases, campaigns, llmRuns } from "@/lib/db/schema";

describe("llm_runs schema", () => {
  it("inserts a row + reads it back", async () => {
    const [a] = await db.insert(artists).values({ name: "A", spotifyArtistId: "p6_s1", timezone: "UTC" }).returning();
    const [r] = await db.insert(releases).values({
      artistId: a.id, kind: "track", spotifyId: "p6_t1", title: "T", releaseDate: "2026-06-01",
    }).returning();
    const [c] = await db.insert(campaigns).values({
      artistId: a.id, releaseId: r.id, dailyBudgetCents: 1000,
      startDate: "2026-06-01", endDate: "2026-07-01", timezone: "UTC",
    }).returning();

    const [run] = await db.insert(llmRuns).values({
      campaignId: c.id,
      date: "2026-06-02",
      kind: "critique",
      model: "anthropic/claude-opus-4-7",
      inputTokens: 1500,
      outputTokens: 200,
      cachedInputTokens: 1200,
      costCents: 12,
      promptHash: "deadbeef00000000",
      output: { winningThemes: ["x"], tiredThemes: [], notes: "" },
    }).returning();
    expect(run.kind).toBe("critique");
    expect(run.cachedInputTokens).toBe(1200);
    expect(run.output).toEqual({ winningThemes: ["x"], tiredThemes: [], notes: "" });
  });

  it("null campaign_id is allowed (for ad-hoc runs)", async () => {
    const [run] = await db.insert(llmRuns).values({
      campaignId: null,
      date: "2026-06-02",
      kind: "safety",
      model: "anthropic/claude-haiku-4-5",
      promptHash: "x",
    }).returning();
    expect(run.campaignId).toBeNull();
  });
});
