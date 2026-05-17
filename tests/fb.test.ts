import { describe, it, expect, vi } from "vitest";
import { makeFBRealClient } from "@/lib/fb/real";
import { makeFBMockClient } from "@/lib/fb/mock";

const noSleep = () => Promise.resolve();

describe("fb real client", () => {
  it("createCampaign posts to /act_<id>/campaigns with Bearer token + parses id", async () => {
    const fetchSpy = vi.fn(async () => new Response(JSON.stringify({ id: "23857..." }), { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);
    const c = makeFBRealClient({ accessToken: "EAA...", fetchOpts: { sleepFn: noSleep } });
    const r = await c.createCampaign({
      adAccountId: "act_99",
      name: "Hana Vu — Romanticism",
      objective: "OUTCOME_TRAFFIC",
      status: "PAUSED",
    });
    expect(r.id).toBe("23857...");
    const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("/act_99/campaigns");
    expect(url).not.toContain("access_token=");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer EAA...");
    const body = String(init.body);
    expect(body).not.toContain("access_token=");
    expect(body).toContain("objective=OUTCOME_TRAFFIC");
    expect(body).toContain("status=PAUSED");
  });

  it("skips undefined fields in the form body (e.g. omitted end_time)", async () => {
    const fetchSpy = vi.fn(async () => new Response(JSON.stringify({ id: "as_2" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);
    const c = makeFBRealClient({ accessToken: "k", fetchOpts: { sleepFn: noSleep } });
    await c.createAdSet({
      adAccountId: "act_1",
      campaignId: "c_1",
      name: "n",
      dailyBudgetCents: 1,
      targetingSpec: {},
      optimization: "LINK_CLICKS",
      startTime: new Date("2026-06-01T00:00:00Z"),
      // endTime intentionally omitted
      status: "PAUSED",
    });
    const [, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    const body = String(init.body);
    expect(body).not.toMatch(/end_time=/);
    expect(body).not.toMatch(/=undefined/);
  });

  it("createAdSet serializes targeting + isoformat times", async () => {
    const fetchSpy = vi.fn(async () => new Response(JSON.stringify({ id: "as_1" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);
    const c = makeFBRealClient({ accessToken: "k", fetchOpts: { sleepFn: noSleep } });
    await c.createAdSet({
      adAccountId: "act_99",
      campaignId: "c_1",
      name: "indie folk us25-44",
      dailyBudgetCents: 1500,
      targetingSpec: { interests: ["indie folk"] },
      optimization: "LINK_CLICKS",
      startTime: new Date("2026-06-01T00:00:00Z"),
      endTime: new Date("2026-07-01T00:00:00Z"),
      status: "PAUSED",
    });
    const [, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    const body = String(init.body);
    expect(body).toContain("daily_budget=1500");
    expect(body).toContain("optimization_goal=LINK_CLICKS");
    expect(body).toMatch(/start_time=2026-06-01T00%3A00%3A00\.000Z/);
    expect(decodeURIComponent(body)).toContain('targeting={"interests":["indie folk"]}');
  });

  it("getAdInsights converts spend to cents + returns null when no data", async () => {
    const fetchSpy = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: [{ spend: "12.34", impressions: "100", inline_link_clicks: "10", ctr: "10", cpc: "1.234" }],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);
    const c = makeFBRealClient({ accessToken: "k", fetchOpts: { sleepFn: noSleep } });

    const ins = await c.getAdInsights("ad_1", "2026-05-17");
    expect(ins).toEqual({ spendCents: 1234, impressions: 100, linkClicks: 10, ctr: 10, cpc: 1.234 });

    const none = await c.getAdInsights("ad_2", "2026-05-17");
    expect(none).toBeNull();
  });

  it("throws with status + body on non-2xx", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("bad token", { status: 401 })));
    const c = makeFBRealClient({ accessToken: "k", fetchOpts: { sleepFn: noSleep, retries: 0 } });
    await expect(c.createCampaign({
      adAccountId: "act_1", name: "x", objective: "OUTCOME_TRAFFIC", status: "PAUSED",
    })).rejects.toThrow(/fb \/act_1\/campaigns: 401/);
  });

  it("pause/archive/setBudget hit the correct path with Bearer header", async () => {
    const fetchSpy = vi.fn(async () => new Response(JSON.stringify({ success: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);
    const c = makeFBRealClient({ accessToken: "k", fetchOpts: { sleepFn: noSleep } });
    await c.pauseAd("ad_99");
    await c.archiveAd("ad_99");
    await c.setAdSetDailyBudget("as_99", 2000);
    const calls = fetchSpy.mock.calls as unknown as [string, RequestInit][];
    const urls = calls.map(([u]) => String(u));
    expect(urls[0]).toContain("/ad_99");
    expect(urls[1]).toContain("/ad_99");
    expect(urls[2]).toContain("/as_99");
    expect(String(calls[2]?.[1]?.body)).toContain("daily_budget=2000");
    for (const [, init] of calls) {
      expect((init.headers as Record<string, string>).Authorization).toBe("Bearer k");
    }
  });
});

describe("fb mock client", () => {
  it("returns deterministic fb_* IDs", async () => {
    const c = makeFBMockClient();
    const camp = await c.createCampaign({ adAccountId: "act_1", name: "n", objective: "OUTCOME_TRAFFIC", status: "PAUSED" });
    const set = await c.createAdSet({
      adAccountId: "act_1", campaignId: camp.id, name: "n", dailyBudgetCents: 1, targetingSpec: {},
      optimization: "LINK_CLICKS", startTime: new Date(), status: "PAUSED",
    });
    expect(camp.id).toMatch(/^fb_camp_\d+/);
    expect(set.id).toMatch(/^fb_adset_\d+/);
  });

  it("insights returns override or null", async () => {
    const c = makeFBMockClient({
      insights: (adId) => adId === "real"
        ? { spendCents: 500, impressions: 10, linkClicks: 1, ctr: 0.1, cpc: 5 }
        : null,
    });
    expect(await c.getAdInsights("real", "2026-05-17")).toMatchObject({ spendCents: 500 });
    expect(await c.getAdInsights("other", "2026-05-17")).toBeNull();
  });
});
