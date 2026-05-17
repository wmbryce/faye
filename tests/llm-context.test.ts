import { describe, it, expect } from "vitest";
import { db } from "@/lib/db";
import { artists, releases, assets } from "@/lib/db/schema";
import { buildArtistContextBlock } from "@/lib/llm/context";

describe("buildArtistContextBlock", () => {
  it("renders artist + voice guide + release + assets", async () => {
    const [a] = await db.insert(artists).values({
      name: "Hana Vu", spotifyArtistId: "hv", timezone: "America/Denver",
      voiceGuide: "warm + earnest indie folk",
    }).returning();
    const [r] = await db.insert(releases).values({
      artistId: a.id, kind: "track", spotifyId: "tr1", title: "Romanticism", releaseDate: "2026-06-01",
    }).returning();
    await db.insert(assets).values([
      { artistId: a.id, kind: "image", url: "/u/1.png", label: "cover", bytes: 1, contentType: "image/png" },
      { artistId: a.id, kind: "video", url: "/u/2.mp4", label: "behind-the-scenes", bytes: 1, contentType: "video/mp4" },
    ]);

    const msg = await buildArtistContextBlock({ artist: a, release: r });
    expect(msg.role).toBe("system");
    expect(msg.cache_control).toEqual({ type: "ephemeral" });
    expect(msg.content).toContain("Hana Vu");
    expect(msg.content).toContain("warm + earnest indie folk");
    expect(msg.content).toContain("Romanticism");
    expect(msg.content).toContain("cover (image)");
    expect(msg.content).toContain("behind-the-scenes (video)");
  });

  it("handles missing voice guide + no assets gracefully", async () => {
    const [a] = await db.insert(artists).values({
      name: "X", spotifyArtistId: "p6_ctx_empty", timezone: "UTC",
    }).returning();
    const [r] = await db.insert(releases).values({
      artistId: a.id, kind: "album", spotifyId: "p6_ctx_album", title: "X", releaseDate: "2026-01-01",
    }).returning();
    const msg = await buildArtistContextBlock({ artist: a, release: r });
    expect(msg.content).toContain("(none provided)");
    expect(msg.content).toContain("(none uploaded)");
  });
});
