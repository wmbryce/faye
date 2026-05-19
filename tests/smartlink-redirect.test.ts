import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { GET } from "@/app/l/[shortcode]/route";
import { db } from "@/lib/db";
import { smartlinks, smartlinkClicks } from "@/lib/db/schema";

const SPOTIFY_URL = "https://open.spotify.com/track/abc123";

function ctxOf(shortcode: string) {
  return { params: Promise.resolve({ shortcode }) };
}

describe("GET /l/[shortcode]", () => {
  it("returns 404 for unknown shortcode", async () => {
    const res = await GET(new Request("http://localhost/l/notexist"), ctxOf("notexist"));
    expect(res.status).toBe(404);
  });

  it("returns 404 for malformed shortcode (special chars)", async () => {
    const res = await GET(new Request("http://localhost/l/bad"), ctxOf("bad code"));
    expect(res.status).toBe(404);
  });

  it("returns 404 for shortcode exceeding 64 chars", async () => {
    const longCode = "a".repeat(65);
    const res = await GET(new Request(`http://localhost/l/${longCode}`), ctxOf(longCode));
    expect(res.status).toBe(404);
  });

  it("returns 302 redirect with correct Location for valid shortcode", async () => {
    await db.insert(smartlinks).values({ id: "abc12345", destinationUrl: SPOTIFY_URL });
    const res = await GET(new Request("http://localhost/l/abc12345"), ctxOf("abc12345"));
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(SPOTIFY_URL);
  });

  it("records a click in smartlink_clicks", async () => {
    await db.insert(smartlinks).values({ id: "clickme1", destinationUrl: SPOTIFY_URL });
    await GET(new Request("http://localhost/l/clickme1"), ctxOf("clickme1"));
    const rows = await db.select().from(smartlinkClicks).where(eq(smartlinkClicks.smartlinkId, "clickme1"));
    expect(rows).toHaveLength(1);
  });

  it("captures userAgent from request headers", async () => {
    await db.insert(smartlinks).values({ id: "agentme1", destinationUrl: SPOTIFY_URL });
    await GET(new Request("http://localhost/l/agentme1", { headers: { "user-agent": "TestBrowser/1.0" } }), ctxOf("agentme1"));
    const [row] = await db.select().from(smartlinkClicks).where(eq(smartlinkClicks.smartlinkId, "agentme1"));
    expect(row.userAgent).toBe("TestBrowser/1.0");
  });

  it("records null userAgent when no header present", async () => {
    await db.insert(smartlinks).values({ id: "noagent1", destinationUrl: SPOTIFY_URL });
    await GET(new Request("http://localhost/l/noagent1"), ctxOf("noagent1"));
    const [row] = await db.select().from(smartlinkClicks).where(eq(smartlinkClicks.smartlinkId, "noagent1"));
    expect(row.userAgent).toBeNull();
  });
});
