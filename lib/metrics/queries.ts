import { and, eq, lt, desc, gte, lte } from "drizzle-orm";
import { db } from "@/lib/db";
import { releaseMetricDaily, adMetricDaily, ads } from "@/lib/db/schema";

const BASELINE_DAYS = 7;

/**
 * Mean of prior `days` days of Spotify streams BEFORE `beforeDate`.
 * Returns 0 if no data exists (cold start).
 */
export async function computeReleaseBaseline(
  releaseId: string,
  beforeDate: string,
  days: number = BASELINE_DAYS,
): Promise<number> {
  const rows = await db
    .select()
    .from(releaseMetricDaily)
    .where(and(eq(releaseMetricDaily.releaseId, releaseId), lt(releaseMetricDaily.date, beforeDate)))
    .orderBy(desc(releaseMetricDaily.date))
    .limit(days);
  if (rows.length === 0) return 0;
  const sum = rows.reduce((a, r) => a + (r.spotifyStreams ?? 0), 0);
  return sum / rows.length;
}

export type DegradedFlags = {
  s4aMissing: boolean;
  fraudExcluded: number;
};

export async function getCampaignDegradedFlags(args: {
  campaignId: string;
  releaseId: string;
  fromDate: string;
  toDate: string;
}): Promise<DegradedFlags> {
  const [latestStream, fraudRows] = await Promise.all([
    db.select({ source: releaseMetricDaily.source })
      .from(releaseMetricDaily)
      .where(and(
        eq(releaseMetricDaily.releaseId, args.releaseId),
        gte(releaseMetricDaily.date, args.fromDate),
        lte(releaseMetricDaily.date, args.toDate),
      ))
      .orderBy(desc(releaseMetricDaily.date))
      .limit(1),
    db.select({ id: adMetricDaily.id })
      .from(adMetricDaily)
      .innerJoin(ads, eq(ads.id, adMetricDaily.adId))
      .where(and(
        eq(ads.campaignId, args.campaignId),
        eq(adMetricDaily.excludedReason, "fraud_suspected"),
        gte(adMetricDaily.date, args.fromDate),
        lte(adMetricDaily.date, args.toDate),
      )),
  ]);

  const s4aMissing = !latestStream[0] || latestStream[0].source !== "s4a";
  return { s4aMissing, fraudExcluded: fraudRows.length };
}

/** Sum of (spotifyStreams - baseline) across s4a rows in [from, to]. Used for cost-per-stream. */
export async function getCampaignStreamDelta(args: {
  releaseId: string;
  campaignStartDate: string;
  fromDate: string;
  toDate: string;
}): Promise<{ totalDelta: number; baseline: number }> {
  const [streamRows, baseline] = await Promise.all([
    db.select({ source: releaseMetricDaily.source, spotifyStreams: releaseMetricDaily.spotifyStreams })
      .from(releaseMetricDaily)
      .where(and(
        eq(releaseMetricDaily.releaseId, args.releaseId),
        gte(releaseMetricDaily.date, args.fromDate),
        lte(releaseMetricDaily.date, args.toDate),
      )),
    computeReleaseBaseline(args.releaseId, args.campaignStartDate),
  ]);
  const totalDelta = streamRows
    .filter((r) => r.source === "s4a" && r.spotifyStreams != null)
    .reduce((a, r) => a + ((r.spotifyStreams ?? 0) - baseline), 0);
  return { totalDelta, baseline };
}

/** Stream delta for `date` vs the `baseline`. null if no row exists. */
export async function getReleaseStreamDelta(
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
