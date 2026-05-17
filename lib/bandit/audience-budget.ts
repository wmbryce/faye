const SHIFT_CAP = 0.20;
const ETA = 0.30;

export type AudienceScoreInput = {
  audienceId: string;
  meanScore: number;
  currentBudgetCents: number;
};

export type AudienceBudgetResult = { audienceId: string; newBudgetCents: number };

/**
 * Redistributes a fixed total daily budget across audiences using multiplicative-weights
 * scaling on each audience's mean composite score, then clamps each audience's new share
 * to ±SHIFT_CAP of its current share so the bandit can't make wild swings day-over-day.
 *
 * Outputs sum to (approximately) totalDailyBudgetCents — rounding error of up to
 * `audiences.length` cents is possible.
 */
export function reweighAudienceBudgets(
  scores: AudienceScoreInput[],
  totalDailyBudgetCents: number,
): AudienceBudgetResult[] {
  if (scores.length === 0) return [];
  if (scores.length === 1) {
    return [{ audienceId: scores[0].audienceId, newBudgetCents: totalDailyBudgetCents }];
  }

  // multiplicative weights
  const exps = scores.map((s) => Math.exp(ETA * s.meanScore));
  const sumExps = exps.reduce((a, b) => a + b, 0);
  const proposedShares = exps.map((e) => e / sumExps);

  // current shares
  const sumCurrent = scores.reduce((a, s) => a + s.currentBudgetCents, 0);
  const currentShares = scores.map((s) =>
    sumCurrent > 0 ? s.currentBudgetCents / sumCurrent : 1 / scores.length,
  );

  // cap shift; renormalize so capped shares sum to 1
  const cappedShares = proposedShares.map((p, i) => {
    const c = currentShares[i];
    const lo = c * (1 - SHIFT_CAP);
    const hi = c * (1 + SHIFT_CAP);
    return Math.max(lo, Math.min(hi, p));
  });
  const sumCapped = cappedShares.reduce((a, b) => a + b, 0);
  const finalShares = sumCapped > 0 ? cappedShares.map((x) => x / sumCapped) : cappedShares.map(() => 1 / scores.length);

  return scores.map((s, i) => ({
    audienceId: s.audienceId,
    newBudgetCents: Math.round(finalShares[i] * totalDailyBudgetCents),
  }));
}
