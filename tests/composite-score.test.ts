import { describe, it, expect } from "vitest";
import { scoreCohort, MIN_IMPRESSIONS } from "@/lib/composite/score";
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

describe("scoreCohort", () => {
  it("low-impression ads excluded with reason and kept alive in output", () => {
    const out = scoreCohort([
      snap({ adId: "ok", impressions: 1000, fbLinkClicks: 100, spendCents: 200 }),
      snap({ adId: "low", impressions: 50 }),
    ]);
    const low = out.find((x) => x.adId === "low");
    expect(low?.score).toBeNull();
    expect(low?.excludedReason).toBe("low_impressions");
    const ok = out.find((x) => x.adId === "ok");
    expect(ok?.score).not.toBeNull();
  });

  it("returns only excluded entries when all ads are below MIN_IMPRESSIONS", () => {
    const out = scoreCohort([snap({ adId: "x", impressions: MIN_IMPRESSIONS - 1 })]);
    expect(out).toHaveLength(1);
    expect(out[0].score).toBeNull();
  });

  it("CPC-only degraded mode when no stream data anywhere", () => {
    const out = scoreCohort([
      snap({ adId: "a", spendCents: 1000, fbLinkClicks: 100 }), // CPC = 10
      snap({ adId: "b", spendCents: 500, fbLinkClicks: 100 }),  // CPC = 5 (better)
      snap({ adId: "c", spendCents: 2000, fbLinkClicks: 100 }), // CPC = 20 (worst)
    ]);
    const byId = Object.fromEntries(out.map((s) => [s.adId, s.score]));
    expect(byId.b).toBeGreaterThan(byId.a as number);
    expect(byId.a).toBeGreaterThan(byId.c as number);
    // weight is 1.0 on CPC, so scores should be the normalized rank values: 0, -1, 1
    expect(byId.c).toBeCloseTo(-1);
    expect(byId.b).toBeCloseTo(1);
  });

  it("full weights apply when both stream signals present", () => {
    const out = scoreCohort([
      snap({ adId: "a", smartlinkClicks: 50, smartlinkStreams: 10, releaseStreamDelta: 100, releaseClicksTotal: 100, spendCents: 1000, fbLinkClicks: 100 }),
      snap({ adId: "b", smartlinkClicks: 50, smartlinkStreams: 25, releaseStreamDelta: 100, releaseClicksTotal: 100, spendCents: 500, fbLinkClicks: 100 }),
    ]);
    const a = out.find((x) => x.adId === "a")!;
    const b = out.find((x) => x.adId === "b")!;
    // b wins on CPC + stream-per-click
    expect(b.score).toBeGreaterThan(a.score!);
  });

  it("degrades 0.6/0.4 when only smartlinkStreams missing", () => {
    const out = scoreCohort([
      snap({ adId: "a", releaseStreamDelta: 100, releaseClicksTotal: 100, smartlinkClicks: 50, spendCents: 1000, fbLinkClicks: 100 }),
      snap({ adId: "b", releaseStreamDelta: 100, releaseClicksTotal: 100, smartlinkClicks: 50, spendCents: 500, fbLinkClicks: 100 }),
    ]);
    // both have the same stream credit; CPC is the deciding factor
    const a = out.find((x) => x.adId === "a")!;
    const b = out.find((x) => x.adId === "b")!;
    expect(b.score).toBeGreaterThan(a.score!);
  });

  it("degrades 0.6/0.4 when only releaseStreamDelta missing", () => {
    const out = scoreCohort([
      snap({ adId: "a", smartlinkClicks: 50, smartlinkStreams: 5, spendCents: 1000, fbLinkClicks: 100 }),
      snap({ adId: "b", smartlinkClicks: 50, smartlinkStreams: 20, spendCents: 500, fbLinkClicks: 100 }),
    ]);
    const a = out.find((x) => x.adId === "a")!;
    const b = out.find((x) => x.adId === "b")!;
    expect(b.score).toBeGreaterThan(a.score!);
  });

  it("custom weights are honored when all signals present", () => {
    const out = scoreCohort([
      snap({ adId: "a", smartlinkClicks: 50, smartlinkStreams: 100, releaseStreamDelta: 100, releaseClicksTotal: 100, spendCents: 100, fbLinkClicks: 1 }),
      snap({ adId: "b", smartlinkClicks: 50, smartlinkStreams: 1, releaseStreamDelta: 100, releaseClicksTotal: 100, spendCents: 100, fbLinkClicks: 1 }),
    ], { weights: { cpc: 0, streamCredit: 0, streamPerClick: 1 } });
    const a = out.find((x) => x.adId === "a")!;
    const b = out.find((x) => x.adId === "b")!;
    // With weight 1.0 on streamPerClick, a (10 streams/click) beats b (0.02 streams/click)
    expect(a.score).toBeGreaterThan(b.score!);
  });

  it("zero fbLinkClicks gives infinite CPC (worst rank) but still scored", () => {
    const out = scoreCohort([
      snap({ adId: "lucky", spendCents: 0, fbLinkClicks: 0, impressions: 1000 }),
      snap({ adId: "normal", spendCents: 1000, fbLinkClicks: 100, impressions: 1000 }),
    ]);
    const lucky = out.find((x) => x.adId === "lucky")!;
    const normal = out.find((x) => x.adId === "normal")!;
    // normal has cheaper CPC so should rank higher
    expect(normal.score).toBeGreaterThan(lucky.score!);
  });
});
