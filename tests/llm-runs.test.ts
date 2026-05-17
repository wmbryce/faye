import { describe, it, expect } from "vitest";
import { db } from "@/lib/db";
import { artists, releases, campaigns, llmRuns } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { logLLMRun, promptHash, estimateCostCents } from "@/lib/llm/runs";

async function seedCampaign() {
  const [a] = await db.insert(artists).values({ name: "A", spotifyArtistId: "p6_runs_s", timezone: "UTC" }).returning();
  const [r] = await db.insert(releases).values({
    artistId: a.id, kind: "track", spotifyId: "p6_runs_t", title: "T", releaseDate: "2026-06-01",
  }).returning();
  const [c] = await db.insert(campaigns).values({
    artistId: a.id, releaseId: r.id, dailyBudgetCents: 1000,
    startDate: "2026-06-01", endDate: "2026-07-01", timezone: "UTC",
  }).returning();
  return { campaign: c };
}

describe("promptHash", () => {
  it("is stable for the same messages", () => {
    const a = promptHash([{ content: "x" }, { content: "y" }]);
    const b = promptHash([{ content: "x" }, { content: "y" }]);
    expect(a).toBe(b);
    expect(a).toHaveLength(16);
  });

  it("changes for different messages", () => {
    expect(promptHash([{ content: "x" }])).not.toBe(promptHash([{ content: "y" }]));
  });
});

describe("logLLMRun", () => {
  it("inserts a row with expected fields", async () => {
    const { campaign } = await seedCampaign();
    await logLLMRun({
      campaignId: campaign.id,
      date: "2026-06-02",
      kind: "critique",
      model: "anthropic/claude-opus-4-7",
      inputTokens: 1000,
      outputTokens: 200,
      cachedInputTokens: 800,
      costCents: 50,
      promptHash: "abc123",
      output: { winningThemes: ["x"] },
    });
    const [row] = await db.select().from(llmRuns).where(eq(llmRuns.campaignId, campaign.id));
    expect(row.kind).toBe("critique");
    expect(row.inputTokens).toBe(1000);
    expect(row.cachedInputTokens).toBe(800);
    expect(row.output).toEqual({ winningThemes: ["x"] });
  });

  it("null costCents + null output are accepted", async () => {
    const { campaign } = await seedCampaign();
    await logLLMRun({
      campaignId: campaign.id,
      date: "2026-06-02",
      kind: "safety",
      model: "anthropic/claude-haiku-4-5",
      inputTokens: 10,
      outputTokens: 5,
      cachedInputTokens: 0,
      costCents: null,
      promptHash: "x",
      output: null,
    });
    const rows = await db.select().from(llmRuns).where(eq(llmRuns.campaignId, campaign.id));
    expect(rows).toHaveLength(1);
    expect(rows[0].costCents).toBeNull();
    expect(rows[0].output).toBeNull();
  });
});

describe("estimateCostCents", () => {
  it("computes a sensible cost for cached input + output", () => {
    const cents = estimateCostCents({
      inputTokens: 10_000,
      outputTokens: 1_000,
      cachedInputTokens: 8_000,
      inputUsdPerM: 3,    // $3 per million input tokens
      outputUsdPerM: 15,  // $15 per million output tokens
      // cachedInputUsdPerM omitted → defaults to 10% of input rate
    });
    // 2000 fresh input * 3/M = 0.006 USD
    // 8000 cached input * 0.3/M = 0.0024 USD
    // 1000 output * 15/M = 0.015 USD
    // total = 0.0234 USD = 2.34 → rounded to 2 cents
    expect(cents).toBe(2);
  });

  it("clamps cachedInputTokens > inputTokens so cost never goes negative", () => {
    const cents = estimateCostCents({
      inputTokens: 1_000,
      outputTokens: 0,
      cachedInputTokens: 5_000, // upstream misreport: bigger than input
      inputUsdPerM: 3,
      outputUsdPerM: 15,
    });
    // cached clamps to 1000, fresh = 0:
    // 1000 cached * 0.3/M = 0.0003 USD → 0.03 cents → rounds to 0
    expect(cents).toBeGreaterThanOrEqual(0);
    expect(cents).toBe(0);
  });
});
