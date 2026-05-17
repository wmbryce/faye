import { and, eq, gte, lte, sum, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { adMetricDaily, llmRuns } from "@/lib/db/schema";
import { getCampaignAdIds } from "@/lib/ads/queries";

export type DailyCostRow = {
  date: string;            // YYYY-MM-DD
  adSpendCents: number;
  llmCostCents: number;
  totalCents: number;
};

/**
 * Daily ad spend + LLM cost for a campaign, joined by date. Dates with no rows
 * on either side are omitted (no zero-fill). Caller can zero-fill if it wants
 * a continuous series for a chart.
 */
export async function dailyCosts(args: {
  campaignId: string;
  fromDate: string;        // YYYY-MM-DD inclusive
  toDate: string;
}): Promise<DailyCostRow[]> {
  // 1. ad spend per date — sum across all ads in the campaign
  const adIds = await getCampaignAdIds(args.campaignId);

  const adSpendByDate = adIds.length === 0
    ? []
    : await db
        .select({ date: adMetricDaily.date, total: sum(adMetricDaily.spendCents).as("total") })
        .from(adMetricDaily)
        .where(and(
          inArray(adMetricDaily.adId, adIds),
          gte(adMetricDaily.date, args.fromDate),
          lte(adMetricDaily.date, args.toDate),
        ))
        .groupBy(adMetricDaily.date);

  // 2. LLM cost per date — sum across this campaign's runs
  const llmCostByDate = await db
    .select({ date: llmRuns.date, total: sum(llmRuns.costCents).as("total") })
    .from(llmRuns)
    .where(and(
      eq(llmRuns.campaignId, args.campaignId),
      gte(llmRuns.date, args.fromDate),
      lte(llmRuns.date, args.toDate),
    ))
    .groupBy(llmRuns.date);

  const merged = new Map<string, { adSpendCents: number; llmCostCents: number }>();
  for (const r of adSpendByDate) {
    merged.set(r.date, { adSpendCents: Number(r.total ?? 0), llmCostCents: 0 });
  }
  for (const r of llmCostByDate) {
    const cur = merged.get(r.date) ?? { adSpendCents: 0, llmCostCents: 0 };
    cur.llmCostCents = Number(r.total ?? 0);
    merged.set(r.date, cur);
  }
  return [...merged.entries()]
    .map(([date, v]) => ({ ...v, date, totalCents: v.adSpendCents + v.llmCostCents }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export type LLMCostBreakdown = {
  critique: number;
  generate: number;
  safety: number;
  total: number;
};

/** Lifetime LLM cost broken down by pass kind for a campaign. */
export async function llmCostByKind(campaignId: string): Promise<LLMCostBreakdown> {
  const rows = await db
    .select({ kind: llmRuns.kind, total: sum(llmRuns.costCents).as("total") })
    .from(llmRuns)
    .where(eq(llmRuns.campaignId, campaignId))
    .groupBy(llmRuns.kind);

  const out: LLMCostBreakdown = { critique: 0, generate: 0, safety: 0, total: 0 };
  for (const r of rows) {
    const cents = Number(r.total ?? 0);
    if (r.kind === "critique" || r.kind === "generate" || r.kind === "safety") {
      out[r.kind] = cents;
    }
    out.total += cents;
  }
  return out;
}
