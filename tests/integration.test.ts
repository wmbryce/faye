import { describe, it, expect } from "vitest";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  artists, releases, audienceSeeds, assets, campaigns, audiences, ads,
  adMetricDaily, releaseMetricDaily, llmRuns, auditLog, consumedRejectTokens,
  AD_STATUS,
} from "@/lib/db/schema";
import { setSecret } from "@/lib/secrets/mutations";
import { createCampaign } from "@/lib/campaigns/mutations";
import { listAudiencesForCampaign } from "@/lib/campaigns/queries";
import { createDraftAd, publishAd, markAdRejected } from "@/lib/ads/mutations";
import { runDailyLoop } from "@/lib/loop/daily";
import { publisherTick } from "@/lib/publisher/tick";
import { makeRejectToken, verifyRejectToken, consumeRejectToken } from "@/lib/email/reject-tokens";
import { makeMockLLMClient } from "@/lib/llm/mock";

const YESTERDAY = "2026-06-15";

describe("full pipeline integration", () => {
  it("end-to-end: campaign → manual ad → metrics → daily loop → publisher → reject flow", async () => {
    // 1. Seed foundational entities
    const [artist] = await db.insert(artists).values({
      name: "Hana Vu", spotifyArtistId: "int_test_hv", timezone: "America/Denver",
      voiceGuide: "warm + earnest indie folk; lyrical; small rooms",
    }).returning();
    const [release] = await db.insert(releases).values({
      artistId: artist.id, kind: "track", spotifyId: "int_test_track", title: "Romanticism",
      releaseDate: "2026-06-01",
    }).returning();
    const [seed] = await db.insert(audienceSeeds).values({
      artistId: artist.id, name: "indie us 25-44",
      targetingSpec: { geo: { countries: ["US"] }, age_min: 25, age_max: 44 },
    }).returning();
    const [asset] = await db.insert(assets).values({
      artistId: artist.id, kind: "image", url: "/api/uploads/int-test-cover.png",
      label: "cover", bytes: 1, contentType: "image/png",
    }).returning();
    await setSecret("fb.ad_account_id", "act_int_test");
    await setSecret("fb.page_id", "int_test_page");

    // 2. Create campaign — drives FB campaign + smartlink + ad set creation via mocks
    const campaign = await createCampaign({
      artistId: artist.id,
      releaseId: release.id,
      dailyBudgetCents: 1000,
      startDate: "2026-06-10",
      endDate: "2026-07-10",
      audienceSeedIds: [seed.id],
      spotifyTrackOrAlbumUrl: "https://open.spotify.com/track/int_test",
    });
    expect(campaign.status).toBe("active");
    expect(campaign.fbCampaignId).toMatch(/^fb_camp_/);
    expect(campaign.smartlinkUrl).toContain("https://ffm.to/");

    const [audience] = await listAudiencesForCampaign(campaign.id);
    expect(audience.fbAdSetId).toMatch(/^fb_adset_/);

    // 3. Hand-write + publish an ad
    const handAd = await createDraftAd({
      campaignId: campaign.id, audienceId: audience.id, assetId: asset.id,
      copyHeadline: "Listen on Spotify", copyPrimaryText: "Hana Vu's new track is out now",
      copyBody: "From Romanticism (2026)",
    });
    await publishAd(handAd.id);
    const [publishedAd] = await db.select().from(ads).where(eq(ads.id, handAd.id));
    expect(publishedAd.status).toBe(AD_STATUS.published);
    expect(publishedAd.fbAdId).toMatch(/^fb_ad_/);

    // 4. Insert simulated yesterday's metrics for that ad
    await db.insert(adMetricDaily).values({
      adId: handAd.id, date: YESTERDAY,
      spendCents: 1000, impressions: 5000, fbLinkClicks: 150,
      smartlinkClicks: 120, smartlinkStreams: 30,
      compositeScore: 0.4,
    });
    await db.insert(releaseMetricDaily).values({
      releaseId: release.id, date: YESTERDAY, spotifyStreams: 2000, source: "s4a",
    });

    // 5. Run the daily loop with deterministic LLM
    // NOTE: contextBlock is the FIRST system message in every call, so
    // req.messages.find(role=system) returns it — not SYSTEM_INSTRUCTIONS.
    // We check allContent (all messages joined) to reliably dispatch by call type.
    let critiqueCalls = 0, generateCalls = 0, safetyCalls = 0;
    const llm = makeMockLLMClient((req) => {
      const allContent = req.messages.map((m) => m.content).join(" ");
      if (allContent.includes("You analyze Facebook ad performance")) {
        critiqueCalls++;
        return {
          text: JSON.stringify({
            winningThemes: ["intimate"], tiredThemes: ["hype"], notes: "stay quiet",
          }),
          usage: { input_tokens: 100, output_tokens: 30, cached_input_tokens: 80, cost_usd: 0.0001 },
        };
      }
      if (allContent.includes("You write Facebook ad copy")) {
        generateCalls++;
        return {
          text: JSON.stringify({
            variants: [
              { copyHeadline: "A quiet record", copyPrimaryText: "Out now. Press play.", copyBody: "", assetHint: "cover" },
              { copyHeadline: "New from Hana Vu", copyPrimaryText: "Stream it tonight.", copyBody: "", assetHint: "cover" },
              { copyHeadline: "GUARANTEED HITS", copyPrimaryText: "MUST LISTEN — MIRACLE TRACK", copyBody: "", assetHint: "any" },
            ],
          }),
          usage: { input_tokens: 200, output_tokens: 60, cached_input_tokens: 150, cost_usd: 0.0003 },
        };
      }
      // safety classifier
      safetyCalls++;
      // First two variants OK, third (the GUARANTEED HITS one) fails
      const isThird = safetyCalls === 3;
      return {
        text: JSON.stringify(isThird ? { ok: false, reasons: ["superlative", "false claim"] } : { ok: true, reasons: [] }),
        usage: { input_tokens: 50, output_tokens: 10, cached_input_tokens: 30, cost_usd: 0.00001 },
      };
    });

    // Bump the ad to gen 4 so we're past cold-start (so critique fires)
    await db.update(ads).set({ generation: 4 }).where(eq(ads.id, handAd.id));

    const dailyResult = await runDailyLoop({
      campaignId: campaign.id,
      yesterday: YESTERDAY,
      overrides: { llm },
    });
    expect(dailyResult.audiencesProcessed).toBe(1);
    expect(dailyResult.variantsGenerated).toBe(3);
    expect(dailyResult.variantsSafe).toBe(2);
    expect(dailyResult.variantsBlocked).toBe(1);
    expect(dailyResult.pendingAdsStaged).toBe(2);
    expect(dailyResult.coldStart).toBe(false);
    expect(dailyResult.generation).toBe(5);
    expect(critiqueCalls).toBeGreaterThanOrEqual(1);

    // 6. Verify llm_runs rows recorded
    const runs = await db.select().from(llmRuns).where(eq(llmRuns.campaignId, campaign.id));
    const kinds = runs.map((r) => r.kind).sort();
    expect(kinds).toContain("critique");
    expect(kinds.filter((k) => k === "generate")).toHaveLength(1);
    expect(kinds.filter((k) => k === "safety")).toHaveLength(3);

    // 7. Pending ads exist
    const pendingAds = await db.select().from(ads).where(and(
      eq(ads.campaignId, campaign.id),
      eq(ads.status, AD_STATUS.pending),
    ));
    expect(pendingAds).toHaveLength(2);
    for (const p of pendingAds) {
      expect(p.publishAt).not.toBeNull();
      expect(p.parentAdId).toBe(handAd.id);
      expect(p.generation).toBe(5);
    }

    // 8. Publisher tick — pending ads have future publishAt, so nothing publishes
    const tickEarly = await publisherTick();
    expect(tickEarly.attempted).toBe(0);

    // 9. Reject one of the pending ads via the token flow
    const target = pendingAds[0];
    const token = await makeRejectToken(target.id);
    const verified = await verifyRejectToken(token);
    expect(verified.ok).toBe(true);
    if (!verified.ok) return;
    await markAdRejected(verified.adId, "operator", "email");
    await consumeRejectToken({ nonce: verified.nonce, adId: verified.adId });

    const [rejected] = await db.select().from(ads).where(eq(ads.id, target.id));
    expect(rejected.status).toBe(AD_STATUS.rejected);
    expect(rejected.rejectedAt).not.toBeNull();

    // Token reuse should fail
    const reVerified = await verifyRejectToken(token);
    expect(reVerified.ok).toBe(false);
    if (!reVerified.ok) expect(reVerified.reason).toBe("already_used");

    // 10. Advance publishAt for the survivor + tick
    const survivor = pendingAds[1];
    await db.update(ads).set({ publishAt: new Date(Date.now() - 1000) }).where(eq(ads.id, survivor.id));
    const tickLate = await publisherTick();
    expect(tickLate.published).toBe(1);
    expect(tickLate.errors).toHaveLength(0);

    const [survivorFresh] = await db.select().from(ads).where(eq(ads.id, survivor.id));
    expect(survivorFresh.status).toBe(AD_STATUS.published);
    expect(survivorFresh.fbAdId).toMatch(/^fb_ad_/);

    // 11. The rejected ad should NEVER have been published (publisher filters on status='pending')
    const [rejectedFresh] = await db.select().from(ads).where(eq(ads.id, target.id));
    expect(rejectedFresh.status).toBe(AD_STATUS.rejected);
    expect(rejectedFresh.fbAdId).toBeNull();

    // 12. Audit log carries the full story
    const allAudit = await db.select().from(auditLog);
    const events = new Set(allAudit.map((e) => e.event));
    expect(events.has("draft_created")).toBe(true);
    expect(events.has("activated")).toBe(true);
    expect(events.has("published")).toBe(true);
    expect(events.has("rejected_via_email")).toBe(true);

    // 13. Consumed-reject-tokens row exists for the rejected ad
    const consumed = await db.select().from(consumedRejectTokens).where(eq(consumedRejectTokens.adId, target.id));
    expect(consumed).toHaveLength(1);
  });
});
