import { describe, it, expect } from "vitest";
import { prune } from "@/lib/bandit/prune";
import type { ScoredAd } from "@/lib/composite/score";

describe("prune", () => {
  it("keeps top K by score, pauses the rest", () => {
    const scored: ScoredAd[] = [
      { adId: "a", score: 0.9 },
      { adId: "b", score: 0.5 },
      { adId: "c", score: 0.1 },
      { adId: "d", score: -0.2 },
      { adId: "e", score: -0.8 },
    ];
    const out = prune({ audienceId: "aud_1", scored, K: 2 });
    const actions = Object.fromEntries(out.map((r) => [r.adId, r.action]));
    expect(actions).toEqual({ a: "keep", b: "keep", c: "pause", d: "pause", e: "pause" });
  });

  it("excluded low_impressions ads → keep_exploring", () => {
    const scored: ScoredAd[] = [
      { adId: "ranked", score: 0.5 },
      { adId: "exp", score: null, excludedReason: "low_impressions" },
    ];
    const out = prune({ audienceId: "aud_1", scored, K: 1 });
    expect(out.find((r) => r.adId === "exp")?.action).toBe("keep_exploring");
    expect(out.find((r) => r.adId === "ranked")?.action).toBe("keep");
  });

  it("fraud_suspected ads → pause", () => {
    const scored: ScoredAd[] = [
      { adId: "ranked", score: 0.5 },
      { adId: "bot", score: null, excludedReason: "fraud_suspected" },
    ];
    const out = prune({ audienceId: "aud_1", scored, K: 5 });
    expect(out.find((r) => r.adId === "bot")?.action).toBe("pause");
    expect(out.find((r) => r.adId === "ranked")?.action).toBe("keep");
  });

  it("K larger than scored cohort still works", () => {
    const scored: ScoredAd[] = [
      { adId: "a", score: 0.9 },
      { adId: "b", score: -0.1 },
    ];
    const out = prune({ audienceId: "aud_1", scored, K: 5 });
    expect(out.every((r) => r.action === "keep")).toBe(true);
  });

  it("K = 0 pauses everything ranked but still keep_exploring", () => {
    const scored: ScoredAd[] = [
      { adId: "a", score: 0.9 },
      { adId: "b", score: null, excludedReason: "low_impressions" },
    ];
    const out = prune({ audienceId: "aud_1", scored, K: 0 });
    expect(out.find((r) => r.adId === "a")?.action).toBe("pause");
    expect(out.find((r) => r.adId === "b")?.action).toBe("keep_exploring");
  });

  it("empty cohort returns empty", () => {
    expect(prune({ audienceId: "aud_1", scored: [], K: 3 })).toEqual([]);
  });
});
