import { describe, it, expect, vi } from "vitest";
import { db } from "@/lib/db";
import { artists, releases, audienceSeeds, assets, campaigns, audiences, ads, auditLog } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { createHmac } from "node:crypto";
import { GET, POST } from "@/app/api/fb/webhook/route";

const VERIFY_TOKEN = "test-verify-token";
const APP_SECRET = "test-app-secret";

function withEnv() {
  vi.stubEnv("FB_WEBHOOK_VERIFY_TOKEN", VERIFY_TOKEN);
  vi.stubEnv("FB_WEBHOOK_APP_SECRET", APP_SECRET);
}

function signBody(raw: string, secret = APP_SECRET): string {
  return "sha256=" + createHmac("sha256", secret).update(raw).digest("hex");
}

async function seedPublishedAd(fbAdId: string) {
  const [a] = await db.insert(artists).values({ name: "A", spotifyArtistId: `p8_fbwh_${fbAdId}`, timezone: "UTC" }).returning();
  const [r] = await db.insert(releases).values({
    artistId: a.id, kind: "track", spotifyId: `p8_fbwh_t_${fbAdId}`, title: "T", releaseDate: "2026-06-01",
  }).returning();
  const [seed] = await db.insert(audienceSeeds).values({
    artistId: a.id, name: "x", targetingSpec: { geo: { countries: ["US"] } },
  }).returning();
  const [asset] = await db.insert(assets).values({
    artistId: a.id, kind: "image", url: "/u/x.png", bytes: 1, contentType: "image/png",
  }).returning();
  const [c] = await db.insert(campaigns).values({
    artistId: a.id, releaseId: r.id, dailyBudgetCents: 1000,
    startDate: "2026-06-01", endDate: "2026-07-01", timezone: "UTC",
  }).returning();
  const [aud] = await db.insert(audiences).values({
    campaignId: c.id, seedId: seed.id, name: "n", fbTargetingSpec: {}, dailyBudgetCents: 1000,
  }).returning();
  const [ad] = await db.insert(ads).values({
    campaignId: c.id, audienceId: aud.id, assetId: asset.id,
    copyHeadline: "h", copyPrimaryText: "p", copyBody: "",
    status: "published", fbAdId,
  }).returning();
  return ad;
}

describe("fb webhook GET (verification)", () => {
  it("returns 503 when verify token not configured", async () => {
    vi.unstubAllEnvs();
    const res = await GET(new Request("http://x/?hub.mode=subscribe&hub.verify_token=anything&hub.challenge=c1"));
    expect(res.status).toBe(503);
  });

  it("returns 403 when token mismatch", async () => {
    withEnv();
    const res = await GET(new Request(`http://x/?hub.mode=subscribe&hub.verify_token=WRONG&hub.challenge=c1`));
    expect(res.status).toBe(403);
  });

  it("returns the challenge string on correct verify", async () => {
    withEnv();
    const res = await GET(new Request(`http://x/?hub.mode=subscribe&hub.verify_token=${VERIFY_TOKEN}&hub.challenge=c1`));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("c1");
  });
});

describe("fb webhook POST (event delivery)", () => {
  it("returns 503 when app secret not configured", async () => {
    vi.unstubAllEnvs();
    const res = await POST(new Request("http://x/", { method: "POST", body: "{}" }));
    expect(res.status).toBe(503);
  });

  it("returns 401 on bad signature", async () => {
    withEnv();
    const body = JSON.stringify({ entry: [] });
    const res = await POST(new Request("http://x/", {
      method: "POST", body,
      headers: { "x-hub-signature-256": "sha256=bad" },
    }));
    expect(res.status).toBe(401);
  });

  it("flips matching ad to rejected + writes audit", async () => {
    withEnv();
    const ad = await seedPublishedAd("fb_test_ad_1");
    const body = JSON.stringify({
      entry: [{
        changes: [{ field: "ads_review", value: { ad_id: "fb_test_ad_1", review_status: "disapproved", disapproval_reason: "misleading" } }],
      }],
    });
    const res = await POST(new Request("http://x/", {
      method: "POST", body,
      headers: { "x-hub-signature-256": signBody(body) },
    }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, disapproved: 1 });

    const [fresh] = await db.select().from(ads).where(eq(ads.id, ad.id));
    expect(fresh.status).toBe("rejected");
    expect(fresh.rejectedReason).toBe("misleading");

    const audit = await db.select().from(auditLog).where(eq(auditLog.entityId, ad.id));
    expect(audit.map((x) => x.event)).toContain("fb_disapproved");
  });

  it("non-disapproval events ignored", async () => {
    withEnv();
    await seedPublishedAd("fb_test_ad_2");
    const body = JSON.stringify({
      entry: [{
        changes: [{ field: "ads_review", value: { ad_id: "fb_test_ad_2", review_status: "approved" } }],
      }],
    });
    const res = await POST(new Request("http://x/", {
      method: "POST", body,
      headers: { "x-hub-signature-256": signBody(body) },
    }));
    expect(await res.json()).toEqual({ ok: true, disapproved: 0 });
  });

  it("unknown fbAdId silently ignored (matched=0)", async () => {
    withEnv();
    const body = JSON.stringify({
      entry: [{
        changes: [{ field: "ads_review", value: { ad_id: "fb_no_such_id", review_status: "disapproved" } }],
      }],
    });
    const res = await POST(new Request("http://x/", {
      method: "POST", body,
      headers: { "x-hub-signature-256": signBody(body) },
    }));
    expect(await res.json()).toEqual({ ok: true, disapproved: 0 });
  });
});
