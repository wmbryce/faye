import { and, eq, lt, desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { releaseMetricDaily } from "@/lib/db/schema";

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
