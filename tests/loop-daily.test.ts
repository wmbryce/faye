import { describe, it, expect } from "vitest";
import { db } from "@/lib/db";
import {
  artists, releases, campaigns, audiences as audiencesTable,
  assets as assetsTable, ads as adsTable, adMetricDaily,
} from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import type { LLMClient } from "@/lib/llm/client";
import type { GenerateRequest, GenerateResponse } from "@/lib/llm/types";
import { runDailyLoop } from "@/lib/loop/daily";
import { DEFAULTS } from "@/lib/loop/defaults";

const NOW = new Date("2026-06-03T12:00:00Z");
const YESTERDAY = "2026-06-02";

// Dispatch mock based on system prompt content
function jsonClient(responses: { critique: unknown; generate: unknown; safety: unknown[] }): LLMClient {
  let safetyCalls = 0;
  return {
    async generate(req: GenerateRequest): Promise<GenerateResponse> {
      const allContent = req.messages.map((m) => m.content).join(" ");
      let text: string;
      if (allContent.includes("You analyze Facebook ad performance")) {
        text = JSON.stringify(responses.critique);
      } else if (allContent.includes("You write Facebook ad copy")) {
        text = JSON.stringify(responses.generate);
      } else {
        // Safety — one call per variant
        text = JSON.stringify(responses.safety[safetyCalls++] ?? { ok: true, reasons: [] });
      }
      return {
        id: "mock",
        model: req.model,
        text,
        usage: { input_tokens: 10, output_tokens: 5, cached_input_tokens: 0, cost_usd: null },
      };
    },
  };
}

function makeVariants(n: number) {
  return {
    variants: Array.from({ length: n }, (_, i) => ({
      copyHeadline: `Headline ${i}`,
      copyPrimaryText: `Primary text ${i}`,
      copyBody: `Body ${i}`,
      assetHint: "any",
    })),
  };
}

const DEFAULT_CRITIQUE = {
  winningThemes: ["earnest"],
  tiredThemes: ["pushy"],
  notes: "keep it real",
};

async function seedFull(opts: { spotifyArtistId: string; spotifyId: string; audienceCount?: number }) {
  const [artist] = await db.insert(artists).values({
    name: "Test Artist",
    spotifyArtistId: opts.spotifyArtistId,
    timezone: "UTC",
  }).returning();

  const [release] = await db.insert(releases).values({
    artistId: artist.id,
    kind: "track",
    spotifyId: opts.spotifyId,
    title: "Test Track",
    releaseDate: "2026-06-01",
  }).returning();

  const [asset] = await db.insert(assetsTable).values({
    artistId: artist.id,
    kind: "image",
    url: "/uploads/test.jpg",
    label: "cover",
    bytes: 1000,
    contentType: "image/jpeg",
  }).returning();

  const [campaign] = await db.insert(campaigns).values({
    artistId: artist.id,
    releaseId: release.id,
    dailyBudgetCents: 5000,
    startDate: "2026-06-01",
    endDate: "2026-07-01",
    timezone: "UTC",
  }).returning();

  const count = opts.audienceCount ?? 1;
  const audienceRows = [];
  for (let i = 0; i < count; i++) {
    const [aud] = await db.insert(audiencesTable).values({
      campaignId: campaign.id,
      name: `Audience ${i}`,
      fbTargetingSpec: {},
      dailyBudgetCents: 1000,
    }).returning();
    audienceRows.push(aud);
  }

  return { artist, release, asset, campaign, audiences: audienceRows };
}

async function seedAdsWithMetrics(
  opts: {
    campaignId: string;
    audienceId: string;
    assetId: string;
    count: number;
    baseScore: number;
    date: string;
  },
) {
  const adRows = [];
  for (let i = 0; i < opts.count; i++) {
    const [ad] = await db.insert(adsTable).values({
      campaignId: opts.campaignId,
      audienceId: opts.audienceId,
      assetId: opts.assetId,
      generation: 1,
      copyHeadline: `Ad ${i}`,
      copyPrimaryText: `Copy for ad ${i}`,
      copyBody: `Body ${i}`,
      status: "published",
    }).returning();

    await db.insert(adMetricDaily).values({
      adId: ad.id,
      date: opts.date,
      spendCents: 200,
      impressions: 1000,
      fbLinkClicks: 40,
      smartlinkClicks: 30,
      smartlinkStreams: 10,
      compositeScore: opts.baseScore - i * 0.1,
    });

    adRows.push(ad);
  }
  return adRows;
}

describe("runDailyLoop", () => {
  it("happy path: 1 audience, 3 scored ads, 5 generated, 4 pass safety → 4 pending", async () => {
    const { campaign, audiences: [audience], asset } = await seedFull({
      spotifyArtistId: "daily_h1_artist",
      spotifyId: "daily_h1_track",
    });

    const existingAds = await seedAdsWithMetrics({
      campaignId: campaign.id,
      audienceId: audience.id,
      assetId: asset.id,
      count: 3,
      baseScore: 0.9,
      date: YESTERDAY,
    });

    // 5 variants generated, 4 pass safety (1 blocked)
    const client = jsonClient({
      critique: DEFAULT_CRITIQUE,
      generate: makeVariants(5),
      safety: [
        { ok: true, reasons: [] },
        { ok: true, reasons: [] },
        { ok: true, reasons: [] },
        { ok: true, reasons: [] },
        { ok: false, reasons: ["false claim"] },
      ],
    });

    const result = await runDailyLoop({
      campaignId: campaign.id,
      yesterday: YESTERDAY,
      now: NOW,
      overrides: { llm: client },
    });

    expect(result.audiencesProcessed).toBe(1);
    expect(result.variantsGenerated).toBe(5);
    expect(result.variantsSafe).toBe(4);
    expect(result.variantsBlocked).toBe(1);
    expect(result.pendingAdsStaged).toBe(4);
    expect(result.generation).toBe(2); // currentGen=1, nextGen=2

    // Verify staged ads in DB
    const staged = await db
      .select()
      .from(adsTable)
      .where(eq(adsTable.campaignId, campaign.id));
    const pending = staged.filter((a) => a.status === "pending");
    expect(pending).toHaveLength(4);
    expect(pending.every((a) => a.generation === 2)).toBe(true);
    expect(pending.every((a) => a.publishAt != null)).toBe(true);
    // publishAt should be now + 30min
    const expectedPublishAt = new Date(NOW.getTime() + DEFAULTS.REVIEW_DELAY_MS);
    for (const p of pending) {
      expect(p.publishAt!.getTime()).toBe(expectedPublishAt.getTime());
    }
  });

  it("multi-audience: 2 audiences each get own variants + separate LLM calls", async () => {
    const { campaign, audiences, asset } = await seedFull({
      spotifyArtistId: "daily_ma_artist",
      spotifyId: "daily_ma_track",
      audienceCount: 2,
    });

    for (const aud of audiences) {
      await seedAdsWithMetrics({
        campaignId: campaign.id,
        audienceId: aud.id,
        assetId: asset.id,
        count: 2,
        baseScore: 0.8,
        date: YESTERDAY,
      });
    }

    // 2 audiences × 5 variants = 10 generated; all pass safety
    const safetyAll = Array.from({ length: 10 }, () => ({ ok: true, reasons: [] }));
    const client = jsonClient({
      critique: DEFAULT_CRITIQUE,
      generate: makeVariants(5),
      safety: safetyAll,
    });

    const result = await runDailyLoop({
      campaignId: campaign.id,
      yesterday: YESTERDAY,
      now: NOW,
      overrides: { llm: client },
    });

    expect(result.audiencesProcessed).toBe(2);
    expect(result.variantsGenerated).toBe(10);
    expect(result.variantsSafe).toBe(10);
    expect(result.variantsBlocked).toBe(0);
    expect(result.pendingAdsStaged).toBe(10);

    // Each audience should have 5 pending ads
    for (const aud of audiences) {
      const audPending = await db
        .select()
        .from(adsTable)
        .where(eq(adsTable.audienceId, aud.id));
      const pending = audPending.filter((a) => a.status === "pending");
      expect(pending).toHaveLength(5);
    }
  });

  it("empty assets pool: variants generated but 0 ads staged", async () => {
    // Seed without asset (then don't insert any asset)
    const [artist] = await db.insert(artists).values({
      name: "No Asset Artist",
      spotifyArtistId: "daily_noasset_artist",
      timezone: "UTC",
    }).returning();

    const [release] = await db.insert(releases).values({
      artistId: artist.id,
      kind: "track",
      spotifyId: "daily_noasset_track",
      title: "Silent",
      releaseDate: "2026-06-01",
    }).returning();

    const [campaign] = await db.insert(campaigns).values({
      artistId: artist.id,
      releaseId: release.id,
      dailyBudgetCents: 5000,
      startDate: "2026-06-01",
      endDate: "2026-07-01",
      timezone: "UTC",
    }).returning();

    const [audience] = await db.insert(audiencesTable).values({
      campaignId: campaign.id,
      name: "Audience",
      fbTargetingSpec: {},
      dailyBudgetCents: 1000,
    }).returning();

    // No metrics rows — no scored ads
    const safetyAll = Array.from({ length: 5 }, () => ({ ok: true, reasons: [] }));
    const client = jsonClient({
      critique: DEFAULT_CRITIQUE,
      generate: makeVariants(5),
      safety: safetyAll,
    });

    const result = await runDailyLoop({
      campaignId: campaign.id,
      yesterday: YESTERDAY,
      now: NOW,
      overrides: { llm: client },
    });

    expect(result.variantsGenerated).toBe(5);
    expect(result.variantsSafe).toBe(5);
    expect(result.pendingAdsStaged).toBe(0); // no assets → none staged
  });

  it("all variants blocked by safety: 0 pending ads, blocked=N", async () => {
    const { campaign, audiences: [audience], asset } = await seedFull({
      spotifyArtistId: "daily_block_artist",
      spotifyId: "daily_block_track",
    });

    await seedAdsWithMetrics({
      campaignId: campaign.id,
      audienceId: audience.id,
      assetId: asset.id,
      count: 2,
      baseScore: 0.7,
      date: YESTERDAY,
    });

    // All 5 variants blocked
    const allBlocked = Array.from({ length: 5 }, () => ({
      ok: false,
      reasons: ["false claim"],
    }));
    const client = jsonClient({
      critique: DEFAULT_CRITIQUE,
      generate: makeVariants(5),
      safety: allBlocked,
    });

    const result = await runDailyLoop({
      campaignId: campaign.id,
      yesterday: YESTERDAY,
      now: NOW,
      overrides: { llm: client },
    });

    expect(result.variantsGenerated).toBe(5);
    expect(result.variantsSafe).toBe(0);
    expect(result.variantsBlocked).toBe(5);
    expect(result.pendingAdsStaged).toBe(0);

    const staged = await db
      .select()
      .from(adsTable)
      .where(eq(adsTable.status, "pending"));
    // Only check ads from this campaign
    const campaignPending = staged.filter((a) => a.campaignId === campaign.id);
    expect(campaignPending).toHaveLength(0);
  });

  describe("cold start", () => {
    it("skips critique when currentGen < COLD_START_GENS (no ads seeded)", async () => {
      // No ads seeded → currentGen=0 → cold-start path
      const { campaign, asset } = await seedFull({
        spotifyArtistId: "daily_cs_skip_artist",
        spotifyId: "daily_cs_skip_track",
      });

      let critiqueCalls = 0;
      const client: LLMClient = {
        async generate(req: GenerateRequest): Promise<GenerateResponse> {
          const allContent = req.messages.map((m) => m.content).join(" ");
          let text: string;
          if (allContent.includes("You analyze Facebook ad performance")) {
            critiqueCalls++;
            text = JSON.stringify({ winningThemes: [], tiredThemes: [], notes: "" });
          } else if (allContent.includes("You write Facebook ad copy")) {
            text = JSON.stringify(makeVariants(5));
          } else {
            text = JSON.stringify({ ok: true, reasons: [] });
          }
          return { id: "mock", model: req.model, text, usage: { input_tokens: 10, output_tokens: 5, cached_input_tokens: 0, cost_usd: null } };
        },
      };

      const r = await runDailyLoop({
        campaignId: campaign.id,
        yesterday: YESTERDAY,
        now: NOW,
        overrides: { llm: client },
      });

      expect(r.coldStart).toBe(true);
      expect(critiqueCalls).toBe(0);
    });

    it("runs critique when currentGen >= COLD_START_GENS", async () => {
      const { campaign, audiences: [audience], asset } = await seedFull({
        spotifyArtistId: "daily_cs_run_artist",
        spotifyId: "daily_cs_run_track",
      });

      // Insert an ad at generation 4 → currentGen=4 >= COLD_START_GENS (4) → not cold start
      await db.insert(adsTable).values({
        campaignId: campaign.id,
        audienceId: audience.id,
        assetId: asset.id,
        generation: 4,
        copyHeadline: "Old Ad",
        copyPrimaryText: "Old Copy",
        copyBody: "",
        status: "published",
      });

      let critiqueCalls = 0;
      const client: LLMClient = {
        async generate(req: GenerateRequest): Promise<GenerateResponse> {
          const allContent = req.messages.map((m) => m.content).join(" ");
          let text: string;
          if (allContent.includes("You analyze Facebook ad performance")) {
            critiqueCalls++;
            text = JSON.stringify({ winningThemes: [], tiredThemes: [], notes: "" });
          } else if (allContent.includes("You write Facebook ad copy")) {
            text = JSON.stringify(makeVariants(5));
          } else {
            text = JSON.stringify({ ok: true, reasons: [] });
          }
          return { id: "mock", model: req.model, text, usage: { input_tokens: 10, output_tokens: 5, cached_input_tokens: 0, cost_usd: null } };
        },
      };

      const r = await runDailyLoop({
        campaignId: campaign.id,
        yesterday: YESTERDAY,
        now: NOW,
        overrides: { llm: client },
      });

      expect(r.coldStart).toBe(false);
      expect(critiqueCalls).toBeGreaterThanOrEqual(1);
    });
  });

  it("parentAdId on staged ad points to top survivor's id", async () => {
    const { campaign, audiences: [audience], asset } = await seedFull({
      spotifyArtistId: "daily_parent_artist",
      spotifyId: "daily_parent_track",
    });

    const existingAds = await seedAdsWithMetrics({
      campaignId: campaign.id,
      audienceId: audience.id,
      assetId: asset.id,
      count: 3,
      baseScore: 0.95,
      date: YESTERDAY,
    });

    // Top scorer is existingAds[0] (highest compositeScore = 0.95)
    const topSurvivorId = existingAds[0].id;

    const safetyAll = Array.from({ length: 3 }, () => ({ ok: true, reasons: [] }));
    const client = jsonClient({
      critique: DEFAULT_CRITIQUE,
      generate: makeVariants(3),
      safety: safetyAll,
    });

    await runDailyLoop({
      campaignId: campaign.id,
      yesterday: YESTERDAY,
      now: NOW,
      overrides: { llm: client },
    });

    const allAds = await db
      .select()
      .from(adsTable)
      .where(eq(adsTable.campaignId, campaign.id));
    const pendingAds = allAds.filter((a) => a.status === "pending");
    expect(pendingAds.length).toBeGreaterThan(0);
    // All staged ads should point to the top survivor
    for (const p of pendingAds) {
      expect(p.parentAdId).toBe(topSurvivorId);
    }
  });
});
