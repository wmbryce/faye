import { and, eq, gte, lte, sum, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { adMetricDaily, ads, releaseMetricDaily } from "@/lib/db/schema";
import { computeReleaseBaseline } from "@/lib/metrics/queries";
import { getCampaignAdIds } from "@/lib/ads/queries";

export type SpendStreamPoint = {
  date: string;
  spendCents: number;
  streams: number | null;     // null when source != "s4a" or no row
  baseline: number;            // mean prior-7d baseline, repeated across the series
};

/**
 * Returns one point per date in [fromDate, toDate] with at least one ad-metric or
 * release-metric row. Baseline is computed once (mean of prior 7 days before
 * campaign start) and repeated on every point so the chart can draw it as a
 * reference line.
 */
export async function spendStreamSeries(args: {
  campaignId: string;
  releaseId: string;
  campaignStartDate: string;
  fromDate: string;
  toDate: string;
}): Promise<SpendStreamPoint[]> {
  const adIds = await getCampaignAdIds(args.campaignId);

  const [spendRows, streamRows, baseline] = await Promise.all([
    adIds.length === 0
      ? Promise.resolve([])
      : db.select({ date: adMetricDaily.date, total: sum(adMetricDaily.spendCents).as("total") })
          .from(adMetricDaily)
          .where(and(
            inArray(adMetricDaily.adId, adIds),
            gte(adMetricDaily.date, args.fromDate),
            lte(adMetricDaily.date, args.toDate),
          ))
          .groupBy(adMetricDaily.date),
    db.select()
      .from(releaseMetricDaily)
      .where(and(
        eq(releaseMetricDaily.releaseId, args.releaseId),
        gte(releaseMetricDaily.date, args.fromDate),
        lte(releaseMetricDaily.date, args.toDate),
      )),
    computeReleaseBaseline(args.releaseId, args.campaignStartDate),
  ]);

  const merged = new Map<string, SpendStreamPoint>();
  for (const r of spendRows) {
    merged.set(r.date, { date: r.date, spendCents: Number(r.total ?? 0), streams: null, baseline });
  }
  for (const r of streamRows) {
    const cur = merged.get(r.date) ?? { date: r.date, spendCents: 0, streams: null, baseline };
    cur.streams = r.source === "s4a" ? (r.spotifyStreams ?? null) : null;
    merged.set(r.date, cur);
  }
  return [...merged.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export type CompositeSeries = {
  data: { date: string; [adKey: string]: number | string | null }[];
  adKeys: string[];  // display labels (truncated headlines) in series order
};

/** Returns the top-N ads (by lifetime spend) and their composite score over time. */
export async function compositeSeries(args: {
  campaignId: string;
  fromDate: string;
  toDate: string;
  limit?: number;
}): Promise<CompositeSeries> {
  const limit = args.limit ?? 8;
  const campaignAds = await db.select().from(ads).where(eq(ads.campaignId, args.campaignId));
  if (campaignAds.length === 0) return { data: [], adKeys: [] };

  // pick top-N by spend within the requested window (and fetch pivot data in one query)
  const allMetrics = await db
    .select()
    .from(adMetricDaily)
    .where(and(
      inArray(adMetricDaily.adId, campaignAds.map((a) => a.id)),
      gte(adMetricDaily.date, args.fromDate),
      lte(adMetricDaily.date, args.toDate),
    ));
  const spendByAd = new Map<string, number>();
  for (const m of allMetrics) {
    spendByAd.set(m.adId, (spendByAd.get(m.adId) ?? 0) + m.spendCents);
  }
  const topAdIds = [...spendByAd.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([id]) => id);
  if (topAdIds.length === 0) return { data: [], adKeys: [] };
  const adById = new Map(campaignAds.map((a) => [a.id, a]));

  // headline label, truncated, dedup with suffix
  const seenLabels = new Map<string, number>();
  const adKeyById = new Map<string, string>();
  for (const id of topAdIds) {
    const headline = adById.get(id)?.copyHeadline ?? id;
    const base = headline.slice(0, 24);
    const n = (seenLabels.get(base) ?? 0) + 1;
    seenLabels.set(base, n);
    adKeyById.set(id, n === 1 ? base : `${base} (${n})`);
  }
  const adKeys = topAdIds.map((id) => adKeyById.get(id)!);

  // pivot
  const pointsByDate = new Map<string, { [adKey: string]: number | string | null }>();
  for (const m of allMetrics) {
    if (!adKeyById.has(m.adId)) continue;
    const cur = pointsByDate.get(m.date) ?? { date: m.date };
    cur[adKeyById.get(m.adId)!] = m.compositeScore;
    pointsByDate.set(m.date, cur);
  }
  // fill missing ad keys with null to keep recharts happy
  const data = [...pointsByDate.values()].map((row) => {
    const filled: typeof row = { ...row };
    for (const k of adKeys) if (!(k in filled)) filled[k] = null;
    return filled;
  }).sort((a, b) => String(a.date).localeCompare(String(b.date)));

  return { data: data as { date: string; [k: string]: number | string | null }[], adKeys };
}
