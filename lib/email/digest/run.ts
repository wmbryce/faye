import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { ads, campaigns } from "@/lib/db/schema";
import { AD_STATUS, CAMPAIGN_STATUS } from "@/lib/db/schema";
import { buildCampaignDigest } from "./builder";
import { sendDailyDigest } from "./send";

export type DigestRunResult = {
  campaignsAttempted: number;
  campaignsBuilt: number;
  buildErrors: { campaignId: string; error: string }[];
  msgId: string | null;
};

/**
 * Returns active campaign IDs that have at least one ad in `pending` status — the
 * set we should send the operator a digest for.
 */
export async function listCampaignIdsWithPendingAds(): Promise<string[]> {
  const rows = await db
    .selectDistinct({ id: campaigns.id })
    .from(campaigns)
    .innerJoin(ads, eq(ads.campaignId, campaigns.id))
    .where(and(eq(campaigns.status, CAMPAIGN_STATUS.active), eq(ads.status, AD_STATUS.pending)));
  return rows.map((r) => r.id);
}

/**
 * Build digests in parallel for a list of campaign IDs and send a single email.
 * Returns a structured summary so callers can report errors.
 */
export async function runDigest(args: {
  campaignIds: string[];
  date: string;
}): Promise<DigestRunResult> {
  if (args.campaignIds.length === 0) {
    return { campaignsAttempted: 0, campaignsBuilt: 0, buildErrors: [], msgId: null };
  }

  const buildResults = await Promise.all(
    args.campaignIds.map(async (id) => {
      try {
        const digest = await buildCampaignDigest({ campaignId: id, yesterday: args.date });
        return { ok: true as const, digest };
      } catch (err) {
        return { ok: false as const, campaignId: id, error: err instanceof Error ? err.message : String(err) };
      }
    }),
  );

  const digests = buildResults.filter((r) => r.ok).map((r) => r.digest);
  const buildErrors = buildResults
    .filter((r): r is { ok: false; campaignId: string; error: string } => !r.ok)
    .map(({ campaignId, error }) => ({ campaignId, error }));

  if (digests.length === 0) {
    return { campaignsAttempted: args.campaignIds.length, campaignsBuilt: 0, buildErrors, msgId: null };
  }

  const msgId = await sendDailyDigest({ date: args.date, digests });
  return { campaignsAttempted: args.campaignIds.length, campaignsBuilt: digests.length, buildErrors, msgId };
}
