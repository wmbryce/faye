import { rankNormalize } from "./normalize";

export const MIN_IMPRESSIONS = 500;
export const DEFAULT_WEIGHTS = { cpc: 0.6, streamCredit: 0.2, streamPerClick: 0.2 } as const;

export type AdSnapshot = {
  adId: string;
  spendCents: number;
  impressions: number;
  fbLinkClicks: number;
  smartlinkClicks: number;
  smartlinkStreams: number | null;
  releaseStreamDelta: number | null;
  releaseClicksTotal: number;
};

export type ExcludedReason = "low_impressions" | "fraud_suspected";

export type ScoredAd = {
  adId: string;
  score: number | null;
  excludedReason?: ExcludedReason;
};

export type ScoreWeights = { cpc?: number; streamCredit?: number; streamPerClick?: number };

export function scoreCohort(
  ads: AdSnapshot[],
  opts: { weights?: ScoreWeights } = {},
): ScoredAd[] {
  const excluded: ScoredAd[] = [];
  const eligible: AdSnapshot[] = [];
  for (const a of ads) {
    if (a.impressions < MIN_IMPRESSIONS) {
      excluded.push({ adId: a.adId, score: null, excludedReason: "low_impressions" });
    } else {
      eligible.push(a);
    }
  }
  if (eligible.length === 0) return excluded;

  const haveStreamCredit = eligible.some((a) => a.releaseStreamDelta != null);
  const haveStreamPerClick = eligible.some((a) => a.smartlinkStreams != null);

  let wCpc = opts.weights?.cpc ?? DEFAULT_WEIGHTS.cpc;
  let wSC = opts.weights?.streamCredit ?? DEFAULT_WEIGHTS.streamCredit;
  let wSPC = opts.weights?.streamPerClick ?? DEFAULT_WEIGHTS.streamPerClick;

  if (!haveStreamCredit && !haveStreamPerClick) {
    wCpc = 1;
    wSC = 0;
    wSPC = 0;
  } else if (!haveStreamCredit) {
    // 0.6/0.4 split CPC vs streamPerClick (spec v1 degraded)
    wCpc = 0.6;
    wSC = 0;
    wSPC = 0.4;
  } else if (!haveStreamPerClick) {
    wCpc = 0.6;
    wSC = 0.4;
    wSPC = 0;
  }

  const cpcVals = eligible.map((a) => (a.fbLinkClicks > 0 ? a.spendCents / a.fbLinkClicks : Number.POSITIVE_INFINITY));
  const streamCreditVals = eligible.map((a) => {
    if (a.releaseStreamDelta == null || a.releaseClicksTotal <= 0) return 0;
    return a.releaseStreamDelta * (a.smartlinkClicks / a.releaseClicksTotal);
  });
  const streamPerClickVals = eligible.map((a) => {
    const denom = a.smartlinkClicks > 0 ? a.smartlinkClicks : a.fbLinkClicks;
    if (denom === 0) return 0;
    const streams = a.smartlinkStreams ?? 0;
    return streams / denom;
  });

  const nCpc = rankNormalize(cpcVals.map((v) => -v));     // negate: lower CPC = better
  const nSC = rankNormalize(streamCreditVals);
  const nSPC = rankNormalize(streamPerClickVals);

  const scored: ScoredAd[] = eligible.map((a, i) => ({
    adId: a.adId,
    score: wCpc * nCpc[i] + wSC * nSC[i] + wSPC * nSPC[i],
  }));

  return [...scored, ...excluded];
}
