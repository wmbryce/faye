import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchWithBackoff } from "@/lib/external/fetch";
import { db } from "@/lib/db";
import { externalCalls } from "@/lib/db/schema";

beforeEach(() => { vi.restoreAllMocks(); });

const noSleep = (_: number) => Promise.resolve();

describe("fetchWithBackoff", () => {
  it("retries on 429 then succeeds; logs once", async () => {
    let calls = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      calls++;
      if (calls < 3) return new Response("", { status: 429, headers: { "retry-after": "0" } });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }));
    const res = await fetchWithBackoff("http://x/y", { method: "GET" }, { service: "test", sleepFn: noSleep });
    expect(res.status).toBe(200);
    expect(calls).toBe(3);
    const logs = await db.select().from(externalCalls);
    expect(logs).toHaveLength(1);
    expect(logs[0].status).toBe(200);
    expect(logs[0].service).toBe("test");
  });

  it("retries on 5xx", async () => {
    let calls = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      calls++;
      if (calls < 2) return new Response("", { status: 503 });
      return new Response("ok", { status: 200 });
    }));
    const res = await fetchWithBackoff("http://x/y", { method: "GET" }, { service: "test", sleepFn: noSleep });
    expect(res.status).toBe(200);
    expect(calls).toBe(2);
  });

  it("does NOT retry on 4xx (other than 429)", async () => {
    let calls = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      calls++;
      return new Response("nope", { status: 401 });
    }));
    const res = await fetchWithBackoff("http://x/y", { method: "GET" }, { service: "test", sleepFn: noSleep });
    expect(res.status).toBe(401);
    expect(calls).toBe(1);
  });

  it("throws after exhausting retries and logs an error row", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 500 })));
    await expect(
      fetchWithBackoff("http://x/y", { method: "GET" }, { service: "test", retries: 1, sleepFn: noSleep })
    ).rejects.toThrow();
    const logs = await db.select().from(externalCalls);
    expect(logs).toHaveLength(1);
    expect(logs[0].error).toContain("http 500");
  });

  it("propagates and logs network errors", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("ECONNREFUSED"); }));
    await expect(
      fetchWithBackoff("http://x/y", { method: "GET" }, { service: "test", retries: 1, sleepFn: noSleep })
    ).rejects.toThrow();
    const logs = await db.select().from(externalCalls);
    expect(logs).toHaveLength(1);
    expect(logs[0].error).toContain("ECONNREFUSED");
  });
});
