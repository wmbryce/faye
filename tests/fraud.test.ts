import { describe, it, expect } from "vitest";
import { fraudFlag } from "@/lib/composite/fraud";
import type { AdSnapshot } from "@/lib/composite/score";

function snap(p: Partial<AdSnapshot> & { adId: string }): AdSnapshot {
  return {
    adId: p.adId,
    spendCents: p.spendCents ?? 1000,
    impressions: p.impressions ?? 1000,
    fbLinkClicks: p.fbLinkClicks ?? 100,
    smartlinkClicks: p.smartlinkClicks ?? 0,
    smartlinkStreams: p.smartlinkStreams ?? null,
    releaseStreamDelta: p.releaseStreamDelta ?? null,
    releaseClicksTotal: p.releaseClicksTotal ?? 0,
  };
}

describe("fraudFlag", () => {
  it("flags high CTR + cheap CPC + no streams", () => {
    expect(fraudFlag(snap({ adId: "x", impressions: 1000, fbLinkClicks: 200, spendCents: 100 }))).toBe(true);
  });

  it("does not flag when CTR is normal", () => {
    expect(fraudFlag(snap({ adId: "x", impressions: 1000, fbLinkClicks: 50, spendCents: 100 }))).toBe(false);
  });

  it("does not flag when CPC is healthy", () => {
    expect(fraudFlag(snap({ adId: "x", impressions: 1000, fbLinkClicks: 200, spendCents: 5000 }))).toBe(false);
  });

  it("does not flag when streams are positive", () => {
    expect(fraudFlag(snap({ adId: "x", impressions: 1000, fbLinkClicks: 200, spendCents: 100, smartlinkStreams: 10 }))).toBe(false);
    expect(fraudFlag(snap({ adId: "x", impressions: 1000, fbLinkClicks: 200, spendCents: 100, releaseStreamDelta: 50 }))).toBe(false);
  });

  it("handles zero impressions gracefully", () => {
    expect(fraudFlag(snap({ adId: "x", impressions: 0 }))).toBe(false);
  });
});
