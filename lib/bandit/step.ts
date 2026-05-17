import { and, eq, lte } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  adMetricDaily, ads, audiences, campaigns,
  type Ad, type AdMetricDaily,
} from "@/lib/db/schema";
import { computeReleaseBaseline, getReleaseStreamDelta } from "@/lib/metrics/queries";
import { scoreCohort, type AdSnapshot } from "@/lib/composite/score";
import { fraudFlag } from "@/lib/composite/fraud";
import { prune } from "@/lib/bandit/prune";
import { reweighAudienceBudgets } from "@/lib/bandit/audience-budget";
import { makeFBClient } from "@/lib/fb/factory";
import type { FBClient } from "@/lib/fb/client";
import { writeAudit } from "@/lib/audit/log";

const K_SURVIVORS = 3;

export type RunBanditStepArgs = {
  campaignId: string;
  date: string;
  overrides?: { fb?: FBClient };
};

export type RunBanditStepResult = {
  audiencesProcessed: number;
  adsRanked: number;
  adsPaused: number;
  adsFlaggedFraud: number;
  budgetsReweighted: number;
  adsArchived: number;
};

export async function runBanditStep(args: RunBanditStepArgs): Promise<RunBanditStepResult> {
  const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, args.campaignId)).limit(1);
  if (!campaign) throw new Error("campaign not found");

  const fb = args.overrides?.fb ?? (await makeFBClient());

  const baseline = await computeReleaseBaseline(campaign.releaseId, campaign.startDate);
  const releaseStreamDelta = await getReleaseStreamDelta(campaign.releaseId, args.date, baseline);

  const metricRows = await db
    .select({ metric: adMetricDaily, ad: ads })
    .from(adMetricDaily)
    .innerJoin(ads, eq(ads.id, adMetricDaily.adId))
    .where(and(eq(ads.campaignId, args.campaignId), eq(adMetricDaily.date, args.date)));

  const byAudience = new Map<string, { metric: AdMetricDaily; ad: Ad }[]>();
  for (const row of metricRows) {
    const list = byAudience.get(row.ad.audienceId) ?? [];
    list.push(row);
    byAudience.set(row.ad.audienceId, list);
  }

  let adsRanked = 0;
  let adsPaused = 0;
  let adsFlaggedFraud = 0;
  const audienceMeanScores: { audienceId: string; meanScore: number; currentBudgetCents: number }[] = [];

  // Pre-fetch all audiences for this campaign once
  const audsList = await db
    .select()
    .from(audiences)
    .where(eq(audiences.campaignId, args.campaignId));
  const audById = new Map(audsList.map((a) => [a.id, a]));

  for (const [audienceId, rows] of byAudience.entries()) {
    const aud = audById.get(audienceId);
    if (!aud) continue;

    const releaseClicksTotal = rows.reduce((acc, r) => acc + r.metric.smartlinkClicks, 0);

    // 1. fraud filter
    const fraudAdIds = new Set<string>();
    const adByIdInThisAudience = new Map(rows.map((r) => [r.ad.id, r.ad]));
    const snapshots: AdSnapshot[] = [];
    for (const row of rows) {
      const snap: AdSnapshot = {
        adId: row.ad.id,
        spendCents: row.metric.spendCents,
        impressions: row.metric.impressions,
        fbLinkClicks: row.metric.fbLinkClicks,
        smartlinkClicks: row.metric.smartlinkClicks,
        smartlinkStreams: row.metric.smartlinkStreams,
        releaseStreamDelta,
        releaseClicksTotal,
      };
      if (fraudFlag(snap)) {
        adsFlaggedFraud++;
        fraudAdIds.add(row.ad.id);
        await db
          .update(adMetricDaily)
          .set({ excludedReason: "fraud_suspected" })
          .where(eq(adMetricDaily.id, row.metric.id));
        continue;
      }
      snapshots.push(snap);
    }

    // 2. score non-fraud ads
    const scored = scoreCohort(snapshots);
    for (const s of scored) {
      await db
        .update(adMetricDaily)
        .set({ compositeScore: s.score, excludedReason: s.excludedReason ?? null })
        .where(and(eq(adMetricDaily.adId, s.adId), eq(adMetricDaily.date, args.date)));
      if (s.score !== null) adsRanked++;
    }

    // 3. prune + apply
    // fraud ads are already excluded from scored; prune handles keep/pause for non-fraud
    const pruneResult = prune({ audienceId, scored, K: K_SURVIVORS });
    for (const p of pruneResult) {
      if (p.action !== "pause") continue;
      const ad = adByIdInThisAudience.get(p.adId);
      if (!ad || ad.status !== "published") continue;
      await db.update(ads).set({ status: "paused" }).where(eq(ads.id, p.adId));
      if (ad.fbAdId) await fb.pauseAd(ad.fbAdId);
      await writeAudit({ entityType: "ad", entityId: p.adId, event: "paused_by_bandit", payload: { audienceId } });
      adsPaused++;
    }

    // pause fraud ads that are still published
    for (const row of rows) {
      if (!fraudAdIds.has(row.ad.id)) continue;
      const ad = adByIdInThisAudience.get(row.ad.id);
      if (!ad || ad.status !== "published") continue;
      await db.update(ads).set({ status: "paused" }).where(eq(ads.id, row.ad.id));
      if (ad.fbAdId) await fb.pauseAd(ad.fbAdId);
      await writeAudit({ entityType: "ad", entityId: row.ad.id, event: "paused_by_bandit", payload: { audienceId, reason: "fraud_suspected" } });
      adsPaused++;
    }

    // 4. mean score for audience (non-null scores only)
    const validScores = scored.map((s) => s.score).filter((x): x is number => x !== null);
    const meanScore =
      validScores.length > 0 ? validScores.reduce((a, b) => a + b, 0) / validScores.length : 0;
    audienceMeanScores.push({ audienceId, meanScore, currentBudgetCents: aud.dailyBudgetCents });
  }

  // 5. reweight audience budgets
  let budgetsReweighted = 0;
  if (audienceMeanScores.length > 0) {
    const newBudgets = reweighAudienceBudgets(audienceMeanScores, campaign.dailyBudgetCents);
    for (const nb of newBudgets) {
      const before = audienceMeanScores.find((s) => s.audienceId === nb.audienceId);
      if (before && before.currentBudgetCents !== nb.newBudgetCents) {
        await db
          .update(audiences)
          .set({ dailyBudgetCents: nb.newBudgetCents })
          .where(eq(audiences.id, nb.audienceId));
        const audRow = audById.get(nb.audienceId);
        if (audRow?.fbAdSetId) await fb.setAdSetDailyBudget(audRow.fbAdSetId, nb.newBudgetCents);
        await writeAudit({
          entityType: "audience",
          entityId: nb.audienceId,
          event: "budget_reweighted",
          payload: { from: before.currentBudgetCents, to: nb.newBudgetCents },
        });
        budgetsReweighted++;
      }
    }
  }

  // Archive pass: every 3rd generation, kill paused ads older than `currentGen - 3`.
  // Prevents accumulation against FB's ad-set ad-count cap. Generations are bumped
  // by Phase 6's LLM loop — for hand-written-only campaigns this is a no-op.
  const archivedAds = await archivePass(args.campaignId, fb);

  return {
    audiencesProcessed: byAudience.size,
    adsRanked,
    adsPaused,
    adsFlaggedFraud,
    budgetsReweighted,
    adsArchived: archivedAds,
  };
}

async function archivePass(campaignId: string, fb: FBClient): Promise<number> {
  // max generation across this campaign's ads
  const allAds = await db
    .select({ generation: ads.generation })
    .from(ads)
    .where(eq(ads.campaignId, campaignId));
  if (allAds.length === 0) return 0;
  const currentGen = allAds.reduce((m, x) => Math.max(m, x.generation), 0);
  if (currentGen === 0 || currentGen % 3 !== 0) return 0;

  const stale = await db
    .select()
    .from(ads)
    .where(and(
      eq(ads.campaignId, campaignId),
      eq(ads.status, "paused"),
      lte(ads.generation, currentGen - 3),
    ));

  let n = 0;
  for (const ad of stale) {
    await db.update(ads).set({ status: "killed" }).where(eq(ads.id, ad.id));
    if (ad.fbAdId) await fb.archiveAd(ad.fbAdId);
    await writeAudit({
      entityType: "ad",
      entityId: ad.id,
      event: "killed_by_archive_pass",
      payload: { generation: ad.generation, currentGen },
    });
    n++;
  }
  return n;
}
