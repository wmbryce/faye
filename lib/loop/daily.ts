import { eq, and, max } from "drizzle-orm";
import { db } from "@/lib/db";
import { ads, adMetricDaily, type Ad, type AdMetricDaily } from "@/lib/db/schema";
import { getCampaign, listAudiencesForCampaign } from "@/lib/campaigns/queries";
import { getArtist } from "@/lib/artists/queries";
import { getRelease } from "@/lib/releases/queries";
import { listAssets } from "@/lib/assets/queries";
import { writeAudit } from "@/lib/audit/log";
import { makeLLMClient } from "@/lib/llm/factory";
import type { LLMClient } from "@/lib/llm/client";
import { buildArtistContextBlock } from "@/lib/llm/context";
import { runCritique, type CritiqueAd, type CritiqueOutput } from "./critique";
import { runGenerate } from "./generate";
import { runSafety } from "./safety";
import { pickAsset } from "./asset-pick";
import { resolveModels, DEFAULTS } from "./defaults";
import { yesterdayInTimezone } from "./schedule";

export type RunDailyLoopArgs = {
  campaignId: string;
  /**
   * ISO YYYY-MM-DD. When omitted, defaults to the calendar day before `now` in
   * the artist's IANA timezone (so a 09:00-local cron always refers to the
   * correct local yesterday, not a UTC-shifted one).
   */
  yesterday?: string;
  /** Override "now" for tests so publish_at is deterministic. */
  now?: Date;
  /** Test injection. */
  overrides?: { llm?: LLMClient };
};

export type RunDailyLoopResult = {
  campaignId: string;
  audiencesProcessed: number;
  variantsGenerated: number;
  variantsSafe: number;
  variantsBlocked: number;
  pendingAdsStaged: number;
  generation: number;
  coldStart: boolean;
};

const COLD_START_CRITIQUE: CritiqueOutput = {
  winningThemes: [],
  tiredThemes: [],
  notes: "cold start — explore freely",
};

function toCritiqueAd(r: { ad: Ad; metric: AdMetricDaily }): CritiqueAd {
  const cpcCents = r.metric.fbLinkClicks > 0
    ? Math.round(r.metric.spendCents / r.metric.fbLinkClicks)
    : 0;
  return {
    copyHeadline: r.ad.copyHeadline,
    copyPrimaryText: r.ad.copyPrimaryText,
    cpcCents,
    smartlinkClicks: r.metric.smartlinkClicks,
    smartlinkStreams: r.metric.smartlinkStreams,
  };
}

export async function runDailyLoop(args: RunDailyLoopArgs): Promise<RunDailyLoopResult> {
  // 1. Fetch campaign + artist + release
  const campaign = await getCampaign(args.campaignId);
  if (!campaign) throw new Error(`campaign not found: ${args.campaignId}`);

  const artist = await getArtist(campaign.artistId);
  if (!artist) throw new Error(`artist not found: ${campaign.artistId}`);

  // Derive yesterday from the artist's local timezone when the caller omits it.
  const yesterday = args.yesterday ?? yesterdayInTimezone(args.now ?? new Date(), artist.timezone);

  const release = await getRelease(campaign.releaseId);
  if (!release) throw new Error(`release not found: ${campaign.releaseId}`);

  // 2. Compute currentGen + nextGen
  const [genRow] = await db
    .select({ maxGen: max(ads.generation) })
    .from(ads)
    .where(eq(ads.campaignId, args.campaignId));
  const currentGen = genRow?.maxGen ?? 0;
  const nextGen = currentGen + 1;
  const isColdStart = currentGen < DEFAULTS.COLD_START_GENS;

  // 3. Build context, list assets, list audiences
  const contextBlock = await buildArtistContextBlock({ artist, release });
  const assets = await listAssets(artist.id);
  const audiences = await listAudiencesForCampaign(args.campaignId);

  // 4. Resolve models
  const models = await resolveModels();

  // 5. LLM client
  const llm = args.overrides?.llm ?? await makeLLMClient();

  // Cold-start audit (once per campaign)
  if (isColdStart) {
    await writeAudit({
      entityType: "campaign",
      entityId: args.campaignId,
      event: "cold_start_skipped_critique",
      payload: { generation: nextGen, threshold: DEFAULTS.COLD_START_GENS },
    });
  }

  // Accumulators
  let totalGenerated = 0;
  let totalSafe = 0;
  let totalBlocked = 0;
  let totalStaged = 0;

  // 6. Per-audience loop. Each audience is isolated in try/catch: one bad pass
  // (LLM throw / parser blow-up / insert error) audits the failure and moves on
  // instead of aborting remaining audiences and the completion audit.
  let audiencesFailed = 0;
  for (let audienceIndex = 0; audienceIndex < audiences.length; audienceIndex++) {
    const audience = audiences[audienceIndex];
    try {

    // a. Pull yesterday's ad_metric_daily rows for this audience
    const rows = await db
      .select({ ad: ads, metric: adMetricDaily })
      .from(adMetricDaily)
      .innerJoin(ads, eq(ads.id, adMetricDaily.adId))
      .where(and(eq(ads.audienceId, audience.id), eq(adMetricDaily.date, yesterday)));

    // b. Rank by composite_score desc (nulls excluded)
    const ranked = rows
      .filter((r) => r.metric.compositeScore != null)
      .sort((a, b) => (b.metric.compositeScore! - a.metric.compositeScore!));

    const survivors = ranked.slice(0, DEFAULTS.K_SURVIVORS).map(toCritiqueAd);
    const killedCount = Math.min(3, Math.max(0, ranked.length - DEFAULTS.K_SURVIVORS));
    const killed = ranked.slice(-killedCount).map(toCritiqueAd);

    // c. Top survivor's ad ID for parentAdId
    const topSurvivorId = ranked[0]?.ad?.id ?? null;

    // d. Run critique (skip during cold start)
    const critique = isColdStart
      ? COLD_START_CRITIQUE
      : await runCritique(llm, {
          contextBlock,
          survivors,
          killed,
          campaignId: args.campaignId,
          date: yesterday,
          model: models.critique,
        });

    // e. Run generate
    const variants = await runGenerate(llm, {
      contextBlock,
      critique,
      audienceDescription: audience.name,
      n: DEFAULTS.N_VARIANTS_PER_AUDIENCE,
      campaignId: args.campaignId,
      date: yesterday,
      model: models.generate,
    });
    totalGenerated += variants.length;

    // f. Run safety
    const verdicts = await runSafety(llm, {
      variants,
      contextBlock,
      campaignId: args.campaignId,
      date: yesterday,
      model: models.safety,
    });

    // g. Separate safe vs blocked
    const safeVariants = variants.filter((_, i) => verdicts[i]?.ok === true);
    const blockedCount = variants.length - safeVariants.length;
    totalSafe += safeVariants.length;
    totalBlocked += blockedCount;

    // h. Stage pending ads
    const publishAtTime = new Date(
      (args.now ?? new Date()).getTime() + DEFAULTS.REVIEW_DELAY_MS
    );

    let stagedForAudience = 0;
    for (let i = 0; i < safeVariants.length; i++) {
      const variant = safeVariants[i];
      const rotationKey = audienceIndex * DEFAULTS.N_VARIANTS_PER_AUDIENCE + i;
      const asset = pickAsset(variant.assetHint, assets, rotationKey);
      if (!asset) continue; // no assets — skip

      await db.insert(ads).values({
        campaignId: args.campaignId,
        audienceId: audience.id,
        assetId: asset.id,
        generation: nextGen,
        copyHeadline: variant.copyHeadline,
        copyPrimaryText: variant.copyPrimaryText,
        copyBody: variant.copyBody,
        parentAdId: topSurvivorId,
        promptHash: null,
        status: "pending",
        publishAt: publishAtTime,
      });
      stagedForAudience++;
    }
    totalStaged += stagedForAudience;

    // Audit per audience
    await writeAudit({
      entityType: "campaign",
      entityId: args.campaignId,
      event: "daily_loop_audience",
      payload: {
        audienceId: audience.id,
        generated: variants.length,
        safe: safeVariants.length,
        blocked: blockedCount,
        staged: stagedForAudience,
        generation: nextGen,
      },
    });
    } catch (error) {
      audiencesFailed++;
      await writeAudit({
        entityType: "campaign",
        entityId: args.campaignId,
        event: "daily_loop_audience_failed",
        payload: {
          audienceId: audience.id,
          generation: nextGen,
          error: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }

  // 7. Final audit
  await writeAudit({
    entityType: "campaign",
    entityId: args.campaignId,
    event: "daily_loop_complete",
    payload: {
      yesterday: yesterday,
      audiencesProcessed: audiences.length,
      audiencesFailed,
      variantsGenerated: totalGenerated,
      variantsSafe: totalSafe,
      variantsBlocked: totalBlocked,
      pendingAdsStaged: totalStaged,
      generation: nextGen,
    },
  });

  return {
    campaignId: args.campaignId,
    audiencesProcessed: audiences.length,
    variantsGenerated: totalGenerated,
    variantsSafe: totalSafe,
    variantsBlocked: totalBlocked,
    pendingAdsStaged: totalStaged,
    generation: nextGen,
    coldStart: isColdStart,
  };
}
