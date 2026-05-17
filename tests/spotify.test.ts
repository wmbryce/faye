import { describe, it, expect, vi } from "vitest";
import { makeSpotifyWebClient } from "@/lib/spotify/web";
import { makeSpotifyS4AClient } from "@/lib/spotify/s4a";
import { makeMockSpotifyClient } from "@/lib/spotify/mock";

const noSleep = () => Promise.resolve();

function withResponses(...responses: Response[]): ReturnType<typeof vi.fn> {
  let i = 0;
  return vi.fn(async () => responses[i++] ?? new Response("", { status: 500 }));
}

describe("spotify web client", () => {
  it("fetches token then artist popularity", async () => {
    const fetchSpy = withResponses(
      new Response(JSON.stringify({ access_token: "tok", expires_in: 3600 }), { status: 200 }),
      new Response(JSON.stringify({ popularity: 73, followers: { total: 12345 } }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchSpy);
    const c = makeSpotifyWebClient({ clientId: "cid", clientSecret: "cs", fetchOpts: { sleepFn: noSleep } });
    const r = await c.getArtistPopularity("artist_1");
    expect(r).toEqual({ popularity: 73, followers: 12345 });
    expect(fetchSpy.mock.calls).toHaveLength(2);
  });

  it("caches token across calls within TTL", async () => {
    const fetchSpy = withResponses(
      new Response(JSON.stringify({ access_token: "tok", expires_in: 3600 }), { status: 200 }),
      new Response(JSON.stringify({ popularity: 1, followers: { total: 0 } }), { status: 200 }),
      new Response(JSON.stringify({ id: "tr1", name: "T", popularity: 5 }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchSpy);
    const c = makeSpotifyWebClient({ clientId: "cid", clientSecret: "cs", fetchOpts: { sleepFn: noSleep } });
    await c.getArtistPopularity("a");
    await c.getTrack("tr1");
    // only one token call total
    const tokenCalls = fetchSpy.mock.calls.filter(([u]) => String(u).includes("/api/token"));
    expect(tokenCalls).toHaveLength(1);
  });

  it("getDailyStreams returns web_estimate (always null)", async () => {
    const c = makeSpotifyWebClient({ clientId: "cid", clientSecret: "cs", fetchOpts: { sleepFn: noSleep } });
    const r = await c.getDailyStreams({ artistId: "a", date: "2026-05-17" });
    expect(r).toEqual({ streams: null, listeners: null, source: "web_estimate" });
  });
});

describe("spotify s4a client", () => {
  it("returns s4a-source streams when API succeeds", async () => {
    const web = makeMockSpotifyClient();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ streams: 4200, listeners: 1300 }), { status: 200 })));
    const c = makeSpotifyS4AClient({ webClient: web, s4aToken: "tok", fetchOpts: { sleepFn: noSleep } });
    const r = await c.getDailyStreams({ artistId: "a", date: "2026-05-17" });
    expect(r).toEqual({ streams: 4200, listeners: 1300, source: "s4a" });
  });

  it("degrades to web_estimate on s4a failure", async () => {
    const web = makeMockSpotifyClient();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 403 })));
    const c = makeSpotifyS4AClient({ webClient: web, s4aToken: "tok", fetchOpts: { sleepFn: noSleep, retries: 0 } });
    const r = await c.getDailyStreams({ artistId: "a", date: "2026-05-17" });
    expect(r.source).toBe("web_estimate");
    expect(r.streams).toBeNull();
  });

  it("degrades to web_estimate when s4a returns malformed JSON", async () => {
    const web = makeMockSpotifyClient();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("not json", { status: 200 })));
    const c = makeSpotifyS4AClient({ webClient: web, s4aToken: "tok", fetchOpts: { sleepFn: noSleep } });
    const r = await c.getDailyStreams({ artistId: "a", date: "2026-05-17" });
    expect(r.source).toBe("web_estimate");
    expect(r.streams).toBeNull();
  });

  it("popularity + track delegate to web client", async () => {
    const web = makeMockSpotifyClient({
      popularity: () => ({ popularity: 88, followers: 999 }),
      track: () => ({ title: "Hello", popularity: 60 }),
    });
    const c = makeSpotifyS4AClient({ webClient: web, s4aToken: "tok", fetchOpts: { sleepFn: noSleep } });
    expect((await c.getArtistPopularity("a")).popularity).toBe(88);
    expect((await c.getTrack("tr"))).toMatchObject({ title: "Hello", popularity: 60 });
  });
});
