import { describe, it, expect } from "vitest";
import { localHour, shouldRunNow, yesterdayInTimezone } from "@/lib/loop/schedule";

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

describe("yesterdayInTimezone", () => {
  it("UTC: subtracts one calendar day", () => {
    expect(yesterdayInTimezone(new Date("2026-06-15T09:00:00Z"), "UTC")).toBe("2026-06-14");
  });

  it("crosses day boundary forward in west-of-UTC zones", () => {
    // 2026-06-15T05:00Z = 2026-06-14T23:00 in America/Denver (MDT, UTC-6)
    // So local "today" is 2026-06-14 and yesterday is 2026-06-13.
    expect(yesterdayInTimezone(new Date("2026-06-15T05:00:00Z"), "America/Denver")).toBe("2026-06-13");
  });

  it("crosses day boundary backward in east-of-UTC zones", () => {
    // 2026-06-15T22:00Z = 2026-06-16T00:00 in Asia/Tokyo (UTC+9)
    // So local "today" is 2026-06-16 and yesterday is 2026-06-15.
    expect(yesterdayInTimezone(new Date("2026-06-15T22:00:00Z"), "Asia/Tokyo")).toBe("2026-06-15");
  });

  it("respects month boundaries", () => {
    expect(yesterdayInTimezone(new Date("2026-07-01T09:00:00Z"), "UTC")).toBe("2026-06-30");
  });
});
