import { describe, it, expect } from "vitest";
import { db } from "@/lib/db";
import { artists, releases, audienceSeeds, assets, campaigns, audiences, ads } from "@/lib/db/schema";
import { makeRejectToken, verifyRejectToken, consumeRejectToken } from "@/lib/email/reject-tokens";
import { signToken } from "@/lib/auth/tokens";
import { env } from "@/lib/env";

async function seedAd() {
  const [a] = await db.insert(artists).values({ name: "A", spotifyArtistId: "p7_rt", timezone: "UTC" }).returning();
  const [r] = await db.insert(releases).values({
    artistId: a.id, kind: "track", spotifyId: "p7_rt_track", title: "T", releaseDate: "2026-06-01",
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
    copyHeadline: "h", copyBody: "b", copyPrimaryText: "p",
  }).returning();
  return { ad };
}

describe("reject tokens", () => {
  it("roundtrip mint + verify", async () => {
    const { ad } = await seedAd();
    const token = await makeRejectToken(ad.id);
    const v = await verifyRejectToken(token);
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.adId).toBe(ad.id);
  });

  it("rejects tampered token", async () => {
    const { ad } = await seedAd();
    const token = await makeRejectToken(ad.id);
    const tampered = token.slice(0, -2) + (token.endsWith("aa") ? "bb" : "aa");
    const v = await verifyRejectToken(tampered);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toBe("bad_signature");
  });

  it("rejects tokens that aren't reject-kind", async () => {
    const fake = await signToken({
      payload: { adId: "00000000-0000-0000-0000-000000000000", kind: "session" },
      ttlMs: 60_000,
      secret: env().AUTH_TOKEN_SECRET,
    });
    const v = await verifyRejectToken(fake);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toBe("wrong_kind");
  });

  it("rejects after consume (single-use)", async () => {
    const { ad } = await seedAd();
    const token = await makeRejectToken(ad.id);
    const v1 = await verifyRejectToken(token);
    expect(v1.ok).toBe(true);
    if (!v1.ok) return;
    await consumeRejectToken({ nonce: v1.nonce, adId: v1.adId });

    const v2 = await verifyRejectToken(token);
    expect(v2.ok).toBe(false);
    if (!v2.ok) expect(v2.reason).toBe("already_used");
  });

  it("rejects expired tokens", async () => {
    const expired = await signToken({
      payload: { adId: "00000000-0000-0000-0000-000000000000", kind: "reject" },
      ttlMs: -1,
      secret: env().AUTH_TOKEN_SECRET,
    });
    const v = await verifyRejectToken(expired);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toBe("expired");
  });

  it("rejects missing adId", async () => {
    const fake = await signToken({
      payload: { kind: "reject" } as any,
      ttlMs: 60_000,
      secret: env().AUTH_TOKEN_SECRET,
    });
    const v = await verifyRejectToken(fake);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toBe("malformed");
  });

  it("consume is idempotent against concurrent retries", async () => {
    const { ad } = await seedAd();
    const token = await makeRejectToken(ad.id);
    const v = await verifyRejectToken(token);
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    // Truly concurrent invocation — exercise the race window
    const [a, b] = await Promise.all([
      consumeRejectToken({ nonce: v.nonce, adId: v.adId }),
      consumeRejectToken({ nonce: v.nonce, adId: v.adId }),
    ]);
    // Exactly one of the two should have won the insert
    expect([a, b].filter(Boolean)).toHaveLength(1);
    const v2 = await verifyRejectToken(token);
    expect(v2.ok).toBe(false);
    if (!v2.ok) expect(v2.reason).toBe("already_used");
  });
});
