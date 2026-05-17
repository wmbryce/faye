import { describe, it, expect, vi } from "vitest";
import { makeFeatureFmClient } from "@/lib/smartlink/featurefm";
import { makeMockSmartlinkClient } from "@/lib/smartlink/mock";

const noSleep = () => Promise.resolve();

describe("featurefm smartlink client", () => {
  it("create posts with X-API-Key + parses response", async () => {
    const fetchSpy = vi.fn(async () => new Response(JSON.stringify({
      id: "sl_42",
      url: "https://ffm.to/sl_42",
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);
    const c = makeFeatureFmClient({ apiKey: "key", fetchOpts: { sleepFn: noSleep } });
    const sl = await c.create({
      artistName: "Hana Vu",
      releaseTitle: "Romanticism",
      spotifyTrackOrAlbumUrl: "https://open.spotify.com/album/abc",
    });
    expect(sl.id).toBe("sl_42");
    expect(sl.shortUrl).toBe("https://ffm.to/sl_42");
    const [, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as any)["X-API-Key"]).toBe("key");
    const body = JSON.parse(init.body as string);
    expect(body.artist.name).toBe("Hana Vu");
    expect(body.actions[0]).toMatchObject({ type: "service", service: "spotify" });
  });

  it("getDailyMetrics parses click + stream counts", async () => {
    const fetchSpy = vi.fn(async () => new Response(JSON.stringify({
      totalClicks: 120,
      servicesClicks: { spotify: 95 },
      spotifyEstimatedStreams: 42,
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);
    const c = makeFeatureFmClient({ apiKey: "key", fetchOpts: { sleepFn: noSleep } });
    const m = await c.getDailyMetrics({ smartlinkId: "sl_42", date: "2026-05-17" });
    expect(m).toEqual({
      smartlinkId: "sl_42",
      date: "2026-05-17",
      clicks: 120,
      spotifyClicks: 95,
      estimatedStreams: 42,
    });
    const [url] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("from=2026-05-17");
    expect(url).toContain("to=2026-05-17");
  });

  it("missing fields default sensibly", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({}), { status: 200 })));
    const c = makeFeatureFmClient({ apiKey: "key", fetchOpts: { sleepFn: noSleep } });
    const m = await c.getDailyMetrics({ smartlinkId: "sl_1", date: "2026-05-17" });
    expect(m.clicks).toBe(0);
    expect(m.spotifyClicks).toBe(0);
    expect(m.estimatedStreams).toBeNull();
  });

  it("throws on non-2xx", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 401 })));
    const c = makeFeatureFmClient({ apiKey: "key", fetchOpts: { sleepFn: noSleep, retries: 0 } });
    await expect(c.create({
      artistName: "A",
      releaseTitle: "R",
      spotifyTrackOrAlbumUrl: "https://open.spotify.com/track/abc",
    })).rejects.toThrow(/featurefm create: 401/);
  });
});

describe("mock smartlink", () => {
  it("returns deterministic shape", async () => {
    const c = makeMockSmartlinkClient();
    const sl = await c.create({
      artistName: "A",
      releaseTitle: "R",
      spotifyTrackOrAlbumUrl: "https://open.spotify.com/track/abc",
    });
    expect(sl.id).toMatch(/^mock_sl_/);
    expect(sl.shortUrl).toMatch(/^https:\/\/ffm\.to\//);
  });
});
