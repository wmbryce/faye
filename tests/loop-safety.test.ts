import { describe, it, expect } from "vitest";
import { db } from "@/lib/db";
import { artists, releases, campaigns, llmRuns } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { makeMockLLMClient } from "@/lib/llm/mock";
import { runSafety, parseSafetyOutput } from "@/lib/loop/safety";
import { cacheArtistContext } from "@/lib/llm/cache";

const CONTEXT = cacheArtistContext({ role: "system", content: "artist context" });
const DATE = "2026-06-02";

async function seedCampaign() {
  const [a] = await db.insert(artists).values({ name: "A", spotifyArtistId: "p6_safe_s", timezone: "UTC" }).returning();
  const [r] = await db.insert(releases).values({
    artistId: a.id, kind: "track", spotifyId: "p6_safe_t", title: "T", releaseDate: "2026-06-01",
  }).returning();
  const [c] = await db.insert(campaigns).values({
    artistId: a.id, releaseId: r.id, dailyBudgetCents: 1000,
    startDate: "2026-06-01", endDate: "2026-07-01", timezone: "UTC",
  }).returning();
  return c;
}

describe("parseSafetyOutput", () => {
  it("parses ok=true with empty reasons", () => {
    expect(parseSafetyOutput(JSON.stringify({ ok: true, reasons: [] }))).toEqual({ ok: true, reasons: [] });
  });

  it("parses ok=false with reasons", () => {
    expect(parseSafetyOutput(JSON.stringify({ ok: false, reasons: ["false claim"] }))).toEqual({ ok: false, reasons: ["false claim"] });
  });

  it("fail-closed on garbage", () => {
    const out = parseSafetyOutput("not json");
    expect(out.ok).toBe(false);
    expect(out.reasons[0]).toMatch(/unparseable/);
  });

  it("fail-closed on missing ok field", () => {
    const out = parseSafetyOutput(JSON.stringify({ reasons: [] }));
    expect(out.ok).toBe(false);
  });

  it("drops non-string reasons", () => {
    const out = parseSafetyOutput(JSON.stringify({ ok: true, reasons: ["a", 42, null, "  b  "] }));
    expect(out.reasons).toEqual(["a", "b"]);
  });
});

describe("runSafety", () => {
  it("returns verdicts in order + writes per-variant llm_runs", async () => {
    const campaign = await seedCampaign();
    let n = 0;
    const client = makeMockLLMClient(() => ({
      text: JSON.stringify(n++ === 0 ? { ok: true, reasons: [] } : { ok: false, reasons: ["false claim"] }),
      usage: { input_tokens: 50, output_tokens: 10, cached_input_tokens: 30, cost_usd: 0.0001 },
    }));

    const verdicts = await runSafety(client, {
      variants: [
        { copyHeadline: "ok ad", copyPrimaryText: "fine", copyBody: "", assetHint: "any" },
        { copyHeadline: "guaranteed!!", copyPrimaryText: "GET STREAMS", copyBody: "", assetHint: "any" },
      ],
      contextBlock: CONTEXT,
      campaignId: campaign.id,
      date: DATE,
      model: "anthropic/claude-haiku-4-5",
    });
    expect(verdicts).toEqual([
      { variantIndex: 0, ok: true, reasons: [] },
      { variantIndex: 1, ok: false, reasons: ["false claim"] },
    ]);
    const rows = await db.select().from(llmRuns).where(eq(llmRuns.campaignId, campaign.id));
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.kind === "safety")).toBe(true);
  });

  it("handles empty input", async () => {
    const campaign = await seedCampaign();
    const client = makeMockLLMClient();
    const verdicts = await runSafety(client, {
      variants: [],
      contextBlock: CONTEXT,
      campaignId: campaign.id, date: DATE, model: "x",
    });
    expect(verdicts).toEqual([]);
    const rows = await db.select().from(llmRuns).where(eq(llmRuns.campaignId, campaign.id));
    expect(rows).toHaveLength(0);
  });
});
