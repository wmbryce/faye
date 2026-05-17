import { describe, it, expect } from "vitest";
import { db } from "@/lib/db";
import { artists } from "@/lib/db/schema";
import { uploadAsset, deleteAsset } from "@/lib/assets/mutations";
import { listAssets } from "@/lib/assets/queries";
import { existsSync, readFileSync } from "node:fs";
import { join, basename } from "node:path";

describe("assets", () => {
  it("uploads writes file and inserts row", async () => {
    const [a] = await db.insert(artists).values({ name: "A", spotifyArtistId: "s1", timezone: "UTC" }).returning();
    const buf = Buffer.from("PNGdata");
    const asset = await uploadAsset({
      artistId: a.id,
      file: { buffer: buf, contentType: "image/png", origName: "cover.png", bytes: buf.length },
      label: "cover",
    });
    expect(asset.kind).toBe("image");
    expect(asset.label).toBe("cover");
    expect(asset.url).toMatch(/^\/api\/uploads\/[0-9a-f]+\.png$/);
    const filename = basename(asset.url);
    const path = join(process.cwd(), "uploads", filename);
    expect(existsSync(path)).toBe(true);
    expect(readFileSync(path).toString()).toBe("PNGdata");
  });

  it("delete removes row and file", async () => {
    const [a] = await db.insert(artists).values({ name: "A", spotifyArtistId: "s1", timezone: "UTC" }).returning();
    const asset = await uploadAsset({
      artistId: a.id,
      file: { buffer: Buffer.from("x"), contentType: "image/png", origName: "x.png", bytes: 1 },
    });
    const filename = basename(asset.url);
    await deleteAsset(asset.id);
    const rows = await listAssets(a.id);
    expect(rows).toHaveLength(0);
    expect(existsSync(join(process.cwd(), "uploads", filename))).toBe(false);
  });
});
