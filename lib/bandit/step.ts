import { and, eq, lt, desc } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  adMetricDaily, releaseMetricDaily, ads, audiences, campaigns,
  type Ad, type AdMetricDaily,
} from "@/lib/db/schema";
import { scoreCohort, type AdSnapshot } from "@/lib/composite/score";
import { fraudFlag } from "@/lib/composite/fraud";
import { prune } from "@/lib/bandit/prune";
import { reweighAudienceBudgets } from "@/lib/bandit/audience-budget";
import { makeFBClient } from "@/lib/fb/factory";
import type { FBClient } from "@/lib/fb/client";
import { writeAudit } from "@/lib/audit/log";

const K_SURVIVORS = 3;
const BASELINE_DAYS = 7;

export type RunBanditStepArgs = {
  campaignId: string;
  date: string;
  overrides?: { fb?: FBClient };
};

export type RunBanditStepResult = {
  audiencesProcessed: number;
  adsScored: number;
  adsPaused: number;
  adsFlaggedFraud: number;
  budgetsReweighted: number;
};

export async function runBanditStep(args: RunBanditStepArgs): Promise<RunBanditStepResult> {
  const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, args.campaignId)).limit(1);
  if (!campaign) throw new Error("campaign not found");

  const fb = args.overrides?.fb ?? (await makeFBClient());

  const baseline = await computeBaseline(campaign.releaseId, campaign.startDate);
  const releaseStreamDelta = await releaseStreamsForDate(campaign.releaseId, args.date, baseline);

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

  let adsScored = 0;
  let adsPaused = 0;
  let adsFlaggedFraud = 0;
  const audienceMeanScores: { audienceId: string; meanScore: number; currentBudgetCents: number }[] = [];

  for (const [audienceId, rows] of byAudience.entries()) {
    const [aud] = await db.select().from(audiences).where(eq(audiences.id, audienceId)).limit(1);
    if (!aud) continue;

    const releaseClicksTotal = rows.reduce((acc, r) => acc + r.metric.smartlinkClicks, 0);

    // 1. fraud filter
    const fraudAdIds = new Set<string>();
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
      adsScored++;
    }

    // 3. prune + apply
    // fraud ads are already excluded from scored; prune handles keep/pause for non-fraud
    const pruneResult = prune({ audienceId, scored, K: K_SURVIVORS });
    for (const p of pruneResult) {
      if (p.action !== "pause") continue;
      const [ad] = await db.select().from(ads).where(eq(ads.id, p.adId)).limit(1);
      if (!ad || ad.status !== "published") continue;
      await db.update(ads).set({ status: "paused" }).where(eq(ads.id, p.adId));
      if (ad.fbAdId) await fb.pauseAd(ad.fbAdId);
      await writeAudit({ entityType: "ad", entityId: p.adId, event: "paused_by_bandit", payload: { audienceId } });
      adsPaused++;
    }

    // pause fraud ads that are still published
    for (const row of rows) {
      if (!fraudAdIds.has(row.ad.id)) continue;
      const [ad] = await db.select().from(ads).where(eq(ads.id, row.ad.id)).limit(1);
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
        const [a] = await db.select().from(audiences).where(eq(audiences.id, nb.audienceId)).limit(1);
        if (a?.fbAdSetId) await fb.setAdSetDailyBudget(a.fbAdSetId, nb.newBudgetCents);
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

  return { audiencesProcessed: byAudience.size, adsScored, adsPaused, adsFlaggedFraud, budgetsReweighted };
}

async function computeBaseline(releaseId: string, campaignStart: string): Promise<number> {
  const rows = await db
    .select()
    .from(releaseMetricDaily)
    .where(and(eq(releaseMetricDaily.releaseId, releaseId), lt(releaseMetricDaily.date, campaignStart)))
    .orderBy(desc(releaseMetricDaily.date))
    .limit(BASELINE_DAYS);
  if (rows.length === 0) return 0;
  const sum = rows.reduce((a, r) => a + (r.spotifyStreams ?? 0), 0);
  return sum / rows.length;
}

async function releaseStreamsForDate(
  releaseId: string,
  date: string,
  baseline: number,
): Promise<number | null> {
  const [row] = await db
    .select()
    .from(releaseMetricDaily)
    .where(and(eq(releaseMetricDaily.releaseId, releaseId), eq(releaseMetricDaily.date, date)))
    .limit(1);
  if (!row || row.spotifyStreams == null) return null;
  return row.spotifyStreams - baseline;
}
