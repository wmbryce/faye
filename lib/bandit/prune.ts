import type { ScoredAd } from "@/lib/composite/score";

export type PruneAction = "keep" | "pause" | "keep_exploring";

export type PruneInput = {
  audienceId: string;
  scored: ScoredAd[];
  K: number;
};

export type PruneRow = { adId: string; action: PruneAction };

/**
 * Per-audience bandit prune. Excluded ads (low_impressions / fraud_suspected)
 * are kept_exploring; ranked ads keep the top K by score, pause the rest.
 */
export function prune({ scored, K }: PruneInput): PruneRow[] {
  const result: PruneRow[] = [];
  const ranked: { adId: string; score: number }[] = [];

  for (const s of scored) {
    if (s.excludedReason === "low_impressions") {
      result.push({ adId: s.adId, action: "keep_exploring" });
    } else if (s.excludedReason === "fraud_suspected") {
      result.push({ adId: s.adId, action: "pause" });
    } else if (s.score !== null) {
      ranked.push({ adId: s.adId, score: s.score });
    }
    // else: malformed (null score, no reason) — drop. Caller's responsibility to flag.
  }

  ranked.sort((a, b) => b.score - a.score);
  ranked.forEach((r, idx) => {
    result.push({ adId: r.adId, action: idx < K ? "keep" : "pause" });
  });
  return result;
}
