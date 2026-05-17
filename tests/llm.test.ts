import { describe, it, expect, vi } from "vitest";
import { makeOpenRouterClient } from "@/lib/llm/openrouter";
import { makeMockLLMClient } from "@/lib/llm/mock";
import { cacheArtistContext } from "@/lib/llm/cache";

describe("openrouter client", () => {
  it("sends auth + parses response with cached tokens + cost", async () => {
    const fetchSpy = vi.fn(async () => new Response(JSON.stringify({
      id: "or_1",
      model: "anthropic/claude-sonnet-4-6",
      choices: [{ message: { content: "hi" } }],
      usage: {
        prompt_tokens: 12,
        completion_tokens: 1,
        prompt_tokens_details: { cached_tokens: 8 },
        cost: 0.0001,
      },
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);
    const c = makeOpenRouterClient({ apiKey: "k1", appUrl: "http://x" });
    const r = await c.generate({ model: "anthropic/claude-sonnet-4-6", messages: [{ role: "user", content: "hi" }] });
    expect(r.text).toBe("hi");
    expect(r.usage.cached_input_tokens).toBe(8);
    expect(r.usage.cost_usd).toBe(0.0001);
    const init = (fetchSpy.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(init.headers).toMatchObject({ "Authorization": "Bearer k1", "X-Title": "Faye" });
  });

  it("throws with status + body on non-2xx", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("rate limit", { status: 429 })));
    const c = makeOpenRouterClient({
      apiKey: "k",
      appUrl: "http://x",
      fetchOpts: { retries: 0, sleepFn: () => Promise.resolve() },
    });
    await expect(c.generate({ model: "x", messages: [] })).rejects.toThrow();
  });
});

describe("mock llm client", () => {
  it("returns defaults", async () => {
    const c = makeMockLLMClient();
    const r = await c.generate({ model: "x", messages: [] });
    expect(r.text).toBe("mock response");
    expect(r.usage.cached_input_tokens).toBe(0);
  });

  it("respects stub override", async () => {
    const c = makeMockLLMClient(() => ({ text: "stubbed" }));
    const r = await c.generate({ model: "x", messages: [] });
    expect(r.text).toBe("stubbed");
  });
});

describe("cacheArtistContext", () => {
  it("attaches ephemeral cache_control", () => {
    const out = cacheArtistContext({ role: "system", content: "hi" });
    expect(out.cache_control).toEqual({ type: "ephemeral" });
    expect(out.content).toBe("hi");
  });
});
