import { describe, it, expect } from "vitest";
import { db } from "@/lib/db";
import { artists, releases, campaigns, llmRuns } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { makeMockLLMClient } from "@/lib/llm/mock";
import { runGenerate, parseGenerateOutput } from "@/lib/loop/generate";
import { cacheArtistContext } from "@/lib/llm/cache";

const CONTEXT = cacheArtistContext({ role: "system", content: "artist context" });
const DATE = "2026-06-02";

async function seedCampaign() {
  const [a] = await db.insert(artists).values({ name: "A", spotifyArtistId: "p6_gen_s", timezone: "UTC" }).returning();
  const [r] = await db.insert(releases).values({
    artistId: a.id, kind: "track", spotifyId: "p6_gen_t", title: "T", releaseDate: "2026-06-01",
  }).returning();
  const [c] = await db.insert(campaigns).values({
    artistId: a.id, releaseId: r.id, dailyBudgetCents: 1000,
    startDate: "2026-06-01", endDate: "2026-07-01", timezone: "UTC",
  }).returning();
  return c;
}

describe("parseGenerateOutput", () => {
  it("parses + clips fields", () => {
    const out = parseGenerateOutput(JSON.stringify({
      variants: [
        { copyHeadline: "Listen on Spotify", copyPrimaryText: "Hana Vu's new track", copyBody: "Romanticism (2026)", assetHint: "cover" },
      ],
    }), 5);
    expect(out).toEqual([
      { copyHeadline: "Listen on Spotify", copyPrimaryText: "Hana Vu's new track", copyBody: "Romanticism (2026)", assetHint: "cover" },
    ]);
  });

  it("clips long fields", () => {
    const out = parseGenerateOutput(JSON.stringify({
      variants: [{
        copyHeadline: "x".repeat(80),
        copyPrimaryText: "y".repeat(200),
        copyBody: "z".repeat(400),
        assetHint: "any",
      }],
    }), 5);
    expect(out[0].copyHeadline).toHaveLength(40);
    expect(out[0].copyPrimaryText).toHaveLength(125);
    expect(out[0].copyBody).toHaveLength(200);
  });

  it("drops variants missing required fields", () => {
    const out = parseGenerateOutput(JSON.stringify({
      variants: [
        { copyHeadline: "ok", copyPrimaryText: "ok", copyBody: "" },
        { copyHeadline: "", copyPrimaryText: "no headline" },
        { copyPrimaryText: "no headline at all", copyBody: "" },
        "not an object",
      ],
    }), 5);
    expect(out).toHaveLength(1);
    expect(out[0].copyHeadline).toBe("ok");
  });

  it("truncates to N", () => {
    const out = parseGenerateOutput(JSON.stringify({
      variants: Array.from({ length: 10 }, (_, i) => ({
        copyHeadline: `h${i}`, copyPrimaryText: `p${i}`, copyBody: "",
      })),
    }), 3);
    expect(out).toHaveLength(3);
  });

  it("defaults missing assetHint to 'any'", () => {
    const out = parseGenerateOutput(JSON.stringify({
      variants: [{ copyHeadline: "h", copyPrimaryText: "p", copyBody: "" }],
    }), 5);
    expect(out[0].assetHint).toBe("any");
  });

  it("returns [] for garbage", () => {
    expect(parseGenerateOutput("not json", 5)).toEqual([]);
    expect(parseGenerateOutput("{}", 5)).toEqual([]);
  });

  it("returns [] for non-positive variant counts", () => {
    const payload = JSON.stringify({
      variants: [{ copyHeadline: "h", copyPrimaryText: "p", copyBody: "b", assetHint: "x" }],
    });
    expect(parseGenerateOutput(payload, 0)).toEqual([]);
    expect(parseGenerateOutput(payload, -1)).toEqual([]);
  });
});

describe("runGenerate", () => {
  it("calls LLM + writes llm_runs + returns variants", async () => {
    const campaign = await seedCampaign();
    const stub = {
      variants: [
        { copyHeadline: "h1", copyPrimaryText: "p1", copyBody: "b1", assetHint: "cover" },
        { copyHeadline: "h2", copyPrimaryText: "p2", copyBody: "b2", assetHint: "any" },
      ],
    };
    const client = makeMockLLMClient(() => ({
      text: JSON.stringify(stub),
      usage: { input_tokens: 200, output_tokens: 80, cached_input_tokens: 150, cost_usd: 0.0025 },
    }));

    const out = await runGenerate(client, {
      contextBlock: CONTEXT,
      critique: { winningThemes: ["earnest"], tiredThemes: [], notes: "" },
      audienceDescription: "indie folk us 25-44",
      n: 5,
      campaignId: campaign.id,
      date: DATE,
      model: "anthropic/claude-sonnet-4-6",
    });
    expect(out).toHaveLength(2);
    expect(out[0].copyHeadline).toBe("h1");

    const rows = await db.select().from(llmRuns).where(eq(llmRuns.campaignId, campaign.id));
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe("generate");
    expect(rows[0].cachedInputTokens).toBe(150);
  });

  it("respects N when LLM returns more variants than asked", async () => {
    const campaign = await seedCampaign();
    const client = makeMockLLMClient(() => ({
      text: JSON.stringify({
        variants: Array.from({ length: 8 }, (_, i) => ({ copyHeadline: `h${i}`, copyPrimaryText: `p${i}`, copyBody: "" })),
      }),
      usage: { input_tokens: 0, output_tokens: 0, cached_input_tokens: 0, cost_usd: null },
    }));
    const out = await runGenerate(client, {
      contextBlock: CONTEXT,
      critique: { winningThemes: [], tiredThemes: [], notes: "" },
      audienceDescription: "x",
      n: 3,
      campaignId: campaign.id, date: DATE,
      model: "x",
    });
    expect(out).toHaveLength(3);
  });
});
