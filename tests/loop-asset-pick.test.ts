import { describe, it, expect } from "vitest";
import { pickAsset } from "@/lib/loop/asset-pick";
import type { Asset } from "@/lib/db/schema";

function asset(id: string, label: string, kind: Asset["kind"] = "image"): Asset {
  return {
    id, artistId: "x", kind, url: `/u/${id}`, label, bytes: 1, contentType: "image/png",
    createdAt: new Date(),
  };
}

describe("pickAsset", () => {
  it("returns null when assets list is empty", () => {
    expect(pickAsset("cover", [], 0)).toBeNull();
  });

  it("returns the matching-label asset (case-insensitive substring)", () => {
    const list = [asset("a", "performance shot"), asset("b", "Album Cover Art")];
    expect(pickAsset("cover", list, 999)?.id).toBe("b");
    expect(pickAsset("PERFORMANCE", list, 0)?.id).toBe("a");
  });

  it("round-robins when hint is 'any'", () => {
    const list = [asset("a", "x"), asset("b", "y"), asset("c", "z")];
    expect(pickAsset("any", list, 0)?.id).toBe("a");
    expect(pickAsset("any", list, 1)?.id).toBe("b");
    expect(pickAsset("any", list, 2)?.id).toBe("c");
    expect(pickAsset("any", list, 3)?.id).toBe("a");
  });

  it("round-robins when hint matches nothing", () => {
    const list = [asset("a", "x"), asset("b", "y")];
    expect(pickAsset("does-not-exist", list, 0)?.id).toBe("a");
    expect(pickAsset("does-not-exist", list, 1)?.id).toBe("b");
  });

  it("round-robins when hint is empty / whitespace", () => {
    const list = [asset("a", "x"), asset("b", "y")];
    expect(pickAsset("", list, 0)?.id).toBe("a");
    expect(pickAsset("   ", list, 1)?.id).toBe("b");
  });

  it("handles negative rotationKey", () => {
    const list = [asset("a", "x"), asset("b", "y"), asset("c", "z")];
    expect(pickAsset("any", list, -1)?.id).toBe("b"); // |-1| % 3 = 1
    expect(pickAsset("any", list, -3)?.id).toBe("a"); // |-3| % 3 = 0
  });
});
