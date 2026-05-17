import { and, eq, isNull, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { ads, audiences, campaigns, assets, type Ad } from "@/lib/db/schema";
import { writeAudit } from "@/lib/audit/log";
import { makeFBClient } from "@/lib/fb/factory";
import { getSecret } from "@/lib/secrets/queries";
import { env } from "@/lib/env";

const HEADLINE_MAX = 40;
const PRIMARY_TEXT_MAX = 125;

export type CreateDraftAdInput = {
  campaignId: string;
  audienceId: string;
  assetId: string;
  copyHeadline: string;
  copyPrimaryText: string;
  copyBody: string;
  generation?: number;
};

export async function createDraftAd(input: CreateDraftAdInput): Promise<Ad> {
  const generation = input.generation ?? 0;
  if (!Number.isInteger(generation) || generation < 0) {
    throw new Error("generation must be a non-negative integer");
  }
  if (!input.copyHeadline.trim()) throw new Error("copyHeadline required");
  if (input.copyHeadline.length > HEADLINE_MAX) {
    throw new Error(`copyHeadline > ${HEADLINE_MAX} chars`);
  }
  if (!input.copyPrimaryText.trim()) throw new Error("copyPrimaryText required");
  if (input.copyPrimaryText.length > PRIMARY_TEXT_MAX) {
    throw new Error(`copyPrimaryText > ${PRIMARY_TEXT_MAX} chars`);
  }

  // Verify (audience, asset) belong to (campaign, artist) — prevents cross-tenant mix-ups.
  const [audience] = await db.select().from(audiences).where(eq(audiences.id, input.audienceId)).limit(1);
  if (!audience || audience.campaignId !== input.campaignId) {
    throw new Error("audience does not belong to this campaign");
  }
  const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, input.campaignId)).limit(1);
  if (!campaign) throw new Error("campaign not found");
  const [asset] = await db.select().from(assets).where(eq(assets.id, input.assetId)).limit(1);
  if (!asset || asset.artistId !== campaign.artistId) {
    throw new Error("asset does not belong to this campaign's artist");
  }

  const [row] = await db.insert(ads).values({
    campaignId: input.campaignId,
    audienceId: input.audienceId,
    assetId: input.assetId,
    generation,
    copyHeadline: input.copyHeadline,
    copyPrimaryText: input.copyPrimaryText,
    copyBody: input.copyBody,
    status: "draft",
  }).returning();
  await writeAudit({ entityType: "ad", entityId: row.id, event: "draft_created" });
  return row;
}

export async function publishAd(adId: string): Promise<void> {
  // Atomically claim the ad by flipping draft/pending → pending and requiring no fbAdId yet.
  // Prevents duplicate FB creatives/ads if publishAd runs concurrently for the same row.
  const [ad] = await db
    .update(ads)
    .set({ status: "pending" })
    .where(and(
      eq(ads.id, adId),
      inArray(ads.status, ["draft", "pending"] as const),
      isNull(ads.fbAdId),
    ))
    .returning();
  if (!ad) {
    const [current] = await db.select().from(ads).where(eq(ads.id, adId)).limit(1);
    if (!current) throw new Error("ad not found");
    if (current.status === "rejected") throw new Error("cannot publish rejected ad");
    throw new Error(`cannot publish ad in status ${current.status}`);
  }

  const [audience] = await db.select().from(audiences).where(eq(audiences.id, ad.audienceId)).limit(1);
  if (!audience?.fbAdSetId) throw new Error("audience has no fbAdSetId — campaign not fully provisioned");
  const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, ad.campaignId)).limit(1);
  if (!campaign?.smartlinkUrl) throw new Error("campaign has no smartlinkUrl");
  const [asset] = await db.select().from(assets).where(eq(assets.id, ad.assetId)).limit(1);
  if (!asset) throw new Error("asset not found");

  const fb = await makeFBClient();
  const [pageId, adAccountId] = await Promise.all([
    getSecret("fb.page_id"),
    getSecret("fb.ad_account_id"),
  ]);
  if (!pageId) throw new Error("missing fb.page_id (set in /settings)");
  if (!adAccountId) throw new Error("missing fb.ad_account_id (set in /settings)");

  const creative = await fb.createAdCreative({
    adAccountId,
    pageId,
    headline: ad.copyHeadline,
    primaryText: ad.copyPrimaryText,
    body: ad.copyBody,
    imageUrl: absoluteAssetUrl(asset.url),
    landingUrl: campaign.smartlinkUrl,
  });
  const fbAd = await fb.createAd({
    adAccountId,
    adSetId: audience.fbAdSetId,
    creativeId: creative.id,
    name: `gen${ad.generation} ${ad.copyHeadline.slice(0, 40)}`,
    status: "ACTIVE",
  });

  await db.update(ads).set({
    fbAdId: fbAd.id,
    status: "published",
    publishAt: new Date(),
  }).where(eq(ads.id, adId));
  await writeAudit({
    entityType: "ad", entityId: adId, event: "published",
    payload: { fbAdId: fbAd.id, creativeId: creative.id },
  });
}

export async function pauseAdById(campaignId: string, adId: string): Promise<void> {
  const [ad] = await db.select().from(ads).where(eq(ads.id, adId)).limit(1);
  if (!ad) throw new Error("ad not found");
  if (ad.campaignId !== campaignId) throw new Error("ad does not belong to this campaign");
  if (ad.fbAdId) {
    const fb = await makeFBClient();
    await fb.pauseAd(ad.fbAdId);
  }
  await db.update(ads).set({ status: "paused" }).where(eq(ads.id, adId));
  await writeAudit({ entityType: "ad", entityId: adId, event: "paused" });
}

export async function killAdById(campaignId: string, adId: string): Promise<void> {
  const [ad] = await db.select().from(ads).where(eq(ads.id, adId)).limit(1);
  if (!ad) throw new Error("ad not found");
  if (ad.campaignId !== campaignId) throw new Error("ad does not belong to this campaign");
  if (ad.fbAdId) {
    const fb = await makeFBClient();
    await fb.archiveAd(ad.fbAdId);
  }
  await db.update(ads).set({ status: "killed" }).where(eq(ads.id, adId));
  await writeAudit({ entityType: "ad", entityId: adId, event: "killed" });
}

function absoluteAssetUrl(relative: string): string {
  return `${env().APP_URL}${relative}`;
}

export async function approvePendingAd(campaignId: string, adId: string): Promise<void> {
  const newPublishAt = new Date();
  // Single conditional UPDATE so two concurrent approve/reject clicks can't
  // both pass a pre-check and apply conflicting writes.
  const [updated] = await db
    .update(ads)
    .set({ publishAt: newPublishAt })
    .where(and(eq(ads.id, adId), eq(ads.campaignId, campaignId), eq(ads.status, "pending")))
    .returning({ id: ads.id });
  if (!updated) throw new Error("cannot approve ad: not pending or not in this campaign");
  await writeAudit({
    entityType: "ad",
    entityId: adId,
    event: "approved_in_app",
    payload: { newPublishAt: newPublishAt.toISOString() },
  });
}

/**
 * Email-reject path. Only flips status when the ad is still pre-publish
 * (draft/pending). If the ad is already on FB (published/paused/killed) we
 * audit a no-op so DB never diverges from remote state — but still return
 * normally so the operator gets confirmation feedback.
 */
export async function markAdRejected(adId: string, reason: string, source: "email" | "in-app"): Promise<void> {
  const updated = await db
    .update(ads)
    .set({
      status: "rejected",
      rejectedAt: new Date(),
      rejectedReason: reason,
    })
    .where(and(eq(ads.id, adId), inArray(ads.status, ["draft", "pending"] as const)))
    .returning({ id: ads.id });
  if (updated.length > 0) {
    await writeAudit({
      entityType: "ad",
      entityId: adId,
      event: source === "email" ? "rejected_via_email" : "rejected_in_app",
      payload: { reason, source },
    });
    return;
  }
  const [current] = await db.select({ status: ads.status }).from(ads).where(eq(ads.id, adId)).limit(1);
  await writeAudit({
    entityType: "ad",
    entityId: adId,
    event: "reject_no_op",
    payload: { reason, source, currentStatus: current?.status ?? "missing" },
  });
}

export async function rejectPendingAd(campaignId: string, adId: string): Promise<void> {
  const updated = await db
    .update(ads)
    .set({
      status: "rejected",
      rejectedAt: new Date(),
      rejectedReason: "operator-in-app",
    })
    .where(and(eq(ads.id, adId), eq(ads.campaignId, campaignId), eq(ads.status, "pending")))
    .returning({ id: ads.id });
  if (!updated.length) throw new Error("cannot reject ad: not pending or not in this campaign");
  await writeAudit({
    entityType: "ad",
    entityId: adId,
    event: "rejected_in_app",
    payload: { reason: "operator-in-app", source: "in-app" },
  });
}

export async function markAdRejectedByFb(fbAdId: string, reason: string): Promise<{ matched: number }> {
  const [ad] = await db.select().from(ads).where(eq(ads.fbAdId, fbAdId)).limit(1);
  if (!ad) return { matched: 0 };
  const previousStatus = ad.status;
  await db.update(ads).set({
    status: "rejected",
    rejectedAt: new Date(),
    rejectedReason: reason,
  }).where(eq(ads.id, ad.id));
  await writeAudit({
    entityType: "ad", entityId: ad.id, event: "fb_disapproved",
    payload: { previousStatus, reason, fbAdId, source: "fb-webhook" },
  });
  return { matched: 1 };
}
