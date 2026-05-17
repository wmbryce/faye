import { describe, it, expect } from "vitest";
import { localHour, shouldRunNow } from "@/lib/loop/schedule";

describe("localHour", () => {
  it("UTC 15:00 in summer → 09:00 in America/Denver", () => {
    // June 2026: America/Denver is MDT (UTC-6)
    expect(localHour(new Date("2026-06-15T15:00:00Z"), "America/Denver")).toBe(9);
  });

  it("UTC 14:00 in winter → 08:00 in America/Denver", () => {
    // January 2026: America/Denver is MST (UTC-7)
    expect(localHour(new Date("2026-01-15T15:00:00Z"), "America/Denver")).toBe(8);
  });

  it("UTC 09:00 = 09:00 for UTC tz", () => {
    expect(localHour(new Date("2026-06-15T09:00:00Z"), "UTC")).toBe(9);
  });

  it("midnight handling: UTC 23:00 → 00:00 in Europe/London (BST = UTC+1 in summer)", () => {
    const now = new Date("2026-06-15T23:00:00Z");
    expect(localHour(now, "Europe/London")).toBe(0);
  });
});

describe("shouldRunNow", () => {
  it("returns true when local hour is 09", () => {
    expect(shouldRunNow(new Date("2026-06-15T09:00:00Z"), "UTC")).toBe(true);
  });

  it("returns false when local hour is not 09", () => {
    expect(shouldRunNow(new Date("2026-06-15T10:00:00Z"), "UTC")).toBe(false);
  });
});
