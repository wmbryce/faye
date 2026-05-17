import { describe, it, expect } from "vitest";
import { db } from "@/lib/db";
import { artists, releases, campaigns, llmRuns } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { makeMockLLMClient } from "@/lib/llm/mock";
import { runCritique, parseCritiqueOutput } from "@/lib/loop/critique";
import { cacheArtistContext } from "@/lib/llm/cache";

const CONTEXT = cacheArtistContext({ role: "system", content: "artist context" });
const DATE = "2026-06-02";

async function seedCampaign() {
  const [a] = await db.insert(artists).values({ name: "A", spotifyArtistId: "p6_crit_s", timezone: "UTC" }).returning();
  const [r] = await db.insert(releases).values({
    artistId: a.id, kind: "track", spotifyId: "p6_crit_t", title: "T", releaseDate: "2026-06-01",
  }).returning();
  const [c] = await db.insert(campaigns).values({
    artistId: a.id, releaseId: r.id, dailyBudgetCents: 1000,
    startDate: "2026-06-01", endDate: "2026-07-01", timezone: "UTC",
  }).returning();
  return c;
}

describe("parseCritiqueOutput", () => {
  it("parses well-formed JSON", () => {
    const out = parseCritiqueOutput(JSON.stringify({
      winningThemes: ["earnest", "nighttime"],
      tiredThemes: ["streaming!"],
      notes: "be quieter",
    }));
    expect(out.winningThemes).toEqual(["earnest", "nighttime"]);
    expect(out.tiredThemes).toEqual(["streaming!"]);
    expect(out.notes).toBe("be quieter");
  });

  it("defaults missing fields", () => {
    const out = parseCritiqueOutput("{}");
    expect(out).toEqual({ winningThemes: [], tiredThemes: [], notes: "" });
  });

  it("survives garbage input", () => {
    const out = parseCritiqueOutput("not json at all");
    expect(out).toEqual({ winningThemes: [], tiredThemes: [], notes: "" });
  });

  it("clips arrays to 3 entries and notes to 200 chars", () => {
    const out = parseCritiqueOutput(JSON.stringify({
      winningThemes: ["a", "b", "c", "d", "e"],
      tiredThemes: ["x", "y", "z", "w"],
      notes: "n".repeat(500),
    }));
    expect(out.winningThemes).toHaveLength(3);
    expect(out.tiredThemes).toHaveLength(3);
    expect(out.notes).toHaveLength(200);
  });

  it("drops non-string array entries", () => {
    const out = parseCritiqueOutput(JSON.stringify({
      winningThemes: ["good", 42, null, " keeper "],
      tiredThemes: [],
    }));
    expect(out.winningThemes).toEqual(["good", "keeper"]);
  });
});

describe("runCritique", () => {
  it("calls LLM + persists llm_runs row + returns parsed output", async () => {
    const campaign = await seedCampaign();
    const stubOutput = { winningThemes: ["x"], tiredThemes: [], notes: "noted" };
    const client = makeMockLLMClient(() => ({
      text: JSON.stringify(stubOutput),
      usage: { input_tokens: 100, output_tokens: 20, cached_input_tokens: 80, cost_usd: 0.0012 },
    }));

    const out = await runCritique(client, {
      contextBlock: CONTEXT,
      survivors: [{ copyHeadline: "h", copyPrimaryText: "p", cpcCents: 50, smartlinkClicks: 10, smartlinkStreams: 3 }],
      killed: [],
      campaignId: campaign.id,
      date: DATE,
      model: "anthropic/claude-opus-4-7",
    });
    expect(out).toEqual(stubOutput);

    const rows = await db.select().from(llmRuns).where(eq(llmRuns.campaignId, campaign.id));
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe("critique");
    expect(rows[0].cachedInputTokens).toBe(80);
    expect(rows[0].costCents).toBe(0);  // 0.0012 USD → 0.12 cents → rounds to 0
    expect(rows[0].output).toEqual(stubOutput);
  });

  it("survives a malformed LLM response (no throw, sensible default)", async () => {
    const campaign = await seedCampaign();
    const client = makeMockLLMClient(() => ({ text: "garbage", usage: { input_tokens: 0, output_tokens: 0, cached_input_tokens: 0, cost_usd: null } }));
    const out = await runCritique(client, {
      contextBlock: CONTEXT,
      survivors: [], killed: [],
      campaignId: campaign.id, date: DATE,
      model: "x",
    });
    expect(out).toEqual({ winningThemes: [], tiredThemes: [], notes: "" });
  });
});
