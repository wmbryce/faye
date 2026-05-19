import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { makeFirstPartyClient } from "@/lib/smartlink/firstparty";
import { db } from "@/lib/db";
import { smartlinks, smartlinkClicks } from "@/lib/db/schema";

const APP_URL = "https://faye.app";
const SPOTIFY_URL = "https://open.spotify.com/track/abc123";
const input = {
  artistName: "Hana Vu",
  releaseTitle: "Romanticism",
  spotifyTrackOrAlbumUrl: SPOTIFY_URL,
};

describe("firstparty smartlink client", () => {

  it("create returns 8-char shortcode + APP_URL-prefixed shortUrl + longUrl", async () => {
    const sl = await makeFirstPartyClient({ appUrl: APP_URL }).create(input);
    expect(sl.id).toHaveLength(8);
    expect(sl.id).toMatch(/^[0-9a-zA-Z]+$/);
    expect(sl.shortUrl).toBe(`${APP_URL}/l/${sl.id}`);
    expect(sl.longUrl).toBe(SPOTIFY_URL);
  });

  it("create writes a smartlinks row", async () => {
    const sl = await makeFirstPartyClient({ appUrl: APP_URL }).create(input);
    const [row] = await db.select().from(smartlinks).where(eq(smartlinks.id, sl.id));
    expect(row).toBeDefined();
    expect(row.destinationUrl).toBe(SPOTIFY_URL);
  });

  it("create retries on PK collision and succeeds", async () => {
    await db.insert(smartlinks).values({ id: "first001", destinationUrl: SPOTIFY_URL });
    const codes = ["first001", "second02"];
    let callCount = 0;
    const sl = await makeFirstPartyClient({ appUrl: APP_URL, shortcodeFn: () => codes[callCount++] }).create(input);
    expect(sl.id).toBe("second02");
    expect(callCount).toBe(2);
  });

  it("create throws after exhausting collision retries", async () => {
    await db.insert(smartlinks).values({ id: "stuck001", destinationUrl: SPOTIFY_URL });
    await expect(
      makeFirstPartyClient({ appUrl: APP_URL, shortcodeFn: () => "stuck001" }).create(input),
    ).rejects.toThrow(/failed to generate unique shortcode/);
  });

  it("getDailyMetrics returns 0 when no clicks", async () => {
    const sl = await makeFirstPartyClient({ appUrl: APP_URL }).create(input);
    const m = await makeFirstPartyClient({ appUrl: APP_URL }).getDailyMetrics({ smartlinkId: sl.id, date: "2026-05-18" });
    expect(m.clicks).toBe(0);
    expect(m.spotifyClicks).toBe(0);
    expect(m.estimatedStreams).toBeNull();
    expect(m.smartlinkId).toBe(sl.id);
    expect(m.date).toBe("2026-05-18");
  });

  it("getDailyMetrics counts only clicks on the requested UTC day", async () => {
    const sl = await makeFirstPartyClient({ appUrl: APP_URL }).create(input);
    await db.insert(smartlinkClicks).values([
      { smartlinkId: sl.id, clickedAt: new Date("2026-05-18T10:00:00Z") },
      { smartlinkId: sl.id, clickedAt: new Date("2026-05-18T22:00:00Z") },
      { smartlinkId: sl.id, clickedAt: new Date("2026-05-17T23:59:59Z") },
      { smartlinkId: sl.id, clickedAt: new Date("2026-05-19T00:00:00Z") },
    ]);
    const m = await makeFirstPartyClient({ appUrl: APP_URL }).getDailyMetrics({ smartlinkId: sl.id, date: "2026-05-18" });
    expect(m.clicks).toBe(2);
    expect(m.spotifyClicks).toBe(2);
  });

  it("getDailyMetrics counts midnight UTC as start of day", async () => {
    const sl = await makeFirstPartyClient({ appUrl: APP_URL }).create(input);
    await db.insert(smartlinkClicks).values({ smartlinkId: sl.id, clickedAt: new Date("2026-05-18T00:00:00.000Z") });
    const m = await makeFirstPartyClient({ appUrl: APP_URL }).getDailyMetrics({ smartlinkId: sl.id, date: "2026-05-18" });
    expect(m.clicks).toBe(1);
  });

  it("create normalizes trailing slash on appUrl", async () => {
    const sl = await makeFirstPartyClient({ appUrl: `${APP_URL}/` }).create(input);
    expect(sl.shortUrl).toBe(`${APP_URL}/l/${sl.id}`);
  });

  it("multiple smartlinks isolated — clicks don't bleed across", async () => {
    const c = makeFirstPartyClient({ appUrl: APP_URL });
    const sl1 = await c.create(input);
    const sl2 = await c.create({ ...input, spotifyTrackOrAlbumUrl: "https://open.spotify.com/track/xyz" });
    await db.insert(smartlinkClicks).values([
      { smartlinkId: sl1.id, clickedAt: new Date("2026-05-18T10:00:00Z") },
      { smartlinkId: sl1.id, clickedAt: new Date("2026-05-18T11:00:00Z") },
      { smartlinkId: sl2.id, clickedAt: new Date("2026-05-18T12:00:00Z") },
    ]);
    const m1 = await c.getDailyMetrics({ smartlinkId: sl1.id, date: "2026-05-18" });
    const m2 = await c.getDailyMetrics({ smartlinkId: sl2.id, date: "2026-05-18" });
    expect(m1.clicks).toBe(2);
    expect(m2.clicks).toBe(1);
  });
});
