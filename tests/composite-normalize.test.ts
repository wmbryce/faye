import { describe, it, expect } from "vitest";
import { rankNormalize } from "@/lib/composite/normalize";

describe("rankNormalize", () => {
  it("empty input", () => {
    expect(rankNormalize([])).toEqual([]);
  });

  it("singleton maps to 0", () => {
    expect(rankNormalize([42])).toEqual([0]);
  });

  it("two values map to [-1, 1]", () => {
    expect(rankNormalize([10, 20])).toEqual([-1, 1]);
    expect(rankNormalize([20, 10])).toEqual([1, -1]);
  });

  it("three sorted ascending values", () => {
    expect(rankNormalize([10, 20, 30])).toEqual([-1, 0, 1]);
  });

  it("preserves original index order", () => {
    expect(rankNormalize([30, 10, 20])).toEqual([1, -1, 0]);
  });

  it("ties resolved by input order (stable)", () => {
    const r = rankNormalize([5, 5, 5, 5]);
    expect(r[0]).toBe(-1);
    expect(r[1]).toBeCloseTo(-1 / 3);
    expect(r[2]).toBeCloseTo(1 / 3);
    expect(r[3]).toBe(1);
  });

  it("handles negative + positive", () => {
    expect(rankNormalize([-5, 0, 5])).toEqual([-1, 0, 1]);
  });

  it("handles fractional values", () => {
    const r = rankNormalize([0.1, 0.3, 0.2]);
    expect(r[0]).toBe(-1);
    expect(r[1]).toBe(1);
    expect(r[2]).toBe(0);
  });
});
