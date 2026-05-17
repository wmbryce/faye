import type { AdSnapshot } from "./score";

/**
 * Flags an ad as suspicious if its click rate is implausibly high, its cost per
 * click implausibly low, and no streams actually result. Heuristic — tune after
 * a few weeks of real data.
 */
export function fraudFlag(ad: AdSnapshot): boolean {
  if (ad.impressions === 0) return false;
  const ctr = ad.fbLinkClicks / ad.impressions;
  const cpcCents = ad.fbLinkClicks > 0 ? ad.spendCents / ad.fbLinkClicks : Number.POSITIVE_INFINITY;
  const noStreams = (ad.smartlinkStreams ?? 0) === 0 && (ad.releaseStreamDelta ?? 0) <= 0;
  return ctr > 0.10 && cpcCents < 5 && noStreams;
}
