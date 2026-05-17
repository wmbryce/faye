# Faye Plan 3 — External Clients Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build typed, testable clients for every external service Faye depends on: Facebook Marketing, Feature.fm smartlinks, Spotify (Web + S4A), OpenRouter (LLM gateway), and the Resend extension for the upcoming digest. Each client exposes a narrow interface, has a mock implementation for tests, and wraps rate-limit / backoff / structured-error concerns.

**Architecture:** One folder per external service under `lib/`. Each folder exports a `Client` interface (the thin domain port Faye consumes), a real HTTP-backed implementation, a mock for tests, and a factory `makeClient()` that returns one based on env. All long-running calls are recorded in a new `external_calls` log table for debugging + cost auditing. Settings page lets the operator enter API tokens stored in a new `secrets` table (DB-encrypted at rest using `AUTH_TOKEN_SECRET`).

**Tech Stack:** Inherited TS / Next.js / Drizzle / Vitest. New: `facebook-nodejs-business-sdk` (FB), bare `fetch` + Zod-typed wrappers (Feature.fm + Spotify + OpenRouter), MSW-like mocks via vitest, native `fetch` retry helper.

**Spec:** `docs/superpowers/specs/2026-05-16-faye-design.md` §7.

---

## File Structure

```
faye/
  lib/db/schema.ts                # MODIFY: add external_calls, secrets
  drizzle/0002_*.sql              # generated

  lib/
    secrets/
      crypto.ts                   # encrypt/decrypt strings with AUTH_TOKEN_SECRET
      queries.ts                  # getSecret(key), listSecrets
      mutations.ts                # setSecret(key, value)
    external/
      logger.ts                   # writes external_calls row per call
      fetch.ts                    # fetchWithBackoff(req, opts) — 429-aware
    fb/
      client.ts                   # FBClient interface
      real.ts                     # facebook-nodejs-business-sdk-backed impl
      mock.ts
      types.ts                    # zod-typed input/output schemas
      factory.ts                  # makeFBClient(secrets)
    smartlink/
      client.ts                   # SmartlinkClient interface
      featurefm.ts                # Feature.fm impl
      mock.ts
      types.ts
      factory.ts
    spotify/
      client.ts                   # SpotifyClient interface
      web.ts                      # Web API (always available)
      s4a.ts                      # Spotify for Artists API (optional)
      mock.ts
      types.ts
      factory.ts
    llm/
      client.ts                   # LLMClient interface
      openrouter.ts               # OpenRouter impl (OpenAI-compatible)
      mock.ts
      types.ts                    # generate, critique, classify schemas
      factory.ts
      cache.ts                    # prompt-cache prefix helpers (artist context block)

  app/settings/
    page.tsx                      # MODIFY: actual settings UI
    actions.ts                    # setSecret + test-connection actions
  app/api/external/test/[service]/route.ts  # ping each service from settings

  tests/
    secrets.test.ts
    fb.test.ts                    # against FB SDK mocked
    smartlink.test.ts             # Feature.fm via fetch mock
    spotify.test.ts
    llm.test.ts                   # OpenRouter via fetch mock
    fetch-backoff.test.ts
```

---

### Task 1: Schema — secrets + external_calls

**Files:**
- Modify: `lib/db/schema.ts`
- Modify: `tests/setup.ts` (truncate new tables)
- Generate migration

- [ ] **Step 1: Append to schema**

```ts
export const secrets = pgTable("secrets", {
  key: text("key").primaryKey(),                  // e.g. "fb.access_token"
  cipherText: text("cipher_text").notNull(),      // base64 IV + ciphertext + tag
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const externalCalls = pgTable("external_calls", {
  id: uuid("id").defaultRandom().primaryKey(),
  service: text("service").notNull(),             // "fb" | "smartlink" | "spotify_web" | "spotify_s4a" | "llm"
  endpoint: text("endpoint").notNull(),
  method: text("method").notNull(),
  status: integer("status"),
  durationMs: integer("duration_ms"),
  error: text("error"),
  requestSummary: jsonb("request_summary"),       // redacted
  responseSummary: jsonb("response_summary"),     // redacted
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
```

- [ ] **Step 2: Generate + apply migration**

```bash
pnpm db:generate
pnpm db:migrate
```

- [ ] **Step 3: Update `tests/setup.ts` truncate list**

Add `external_calls, secrets,` to the TRUNCATE.

- [ ] **Step 4: Commit**

```bash
git add lib/db/schema.ts drizzle/ tests/setup.ts
git commit -m "schema: secrets + external_calls"
```

---

### Task 2: Encrypted secrets

**Files:**
- Create: `lib/secrets/crypto.ts`
- Create: `lib/secrets/queries.ts`
- Create: `lib/secrets/mutations.ts`
- Create: `tests/secrets.test.ts`

- [ ] **Step 1: TDD test**

```ts
import { describe, it, expect } from "vitest";
import { setSecret } from "@/lib/secrets/mutations";
import { getSecret } from "@/lib/secrets/queries";

describe("secrets", () => {
  it("roundtrip", async () => {
    await setSecret("fb.access_token", "super-secret-value");
    expect(await getSecret("fb.access_token")).toBe("super-secret-value");
  });

  it("update overwrites", async () => {
    await setSecret("k", "v1");
    await setSecret("k", "v2");
    expect(await getSecret("k")).toBe("v2");
  });

  it("missing returns null", async () => {
    expect(await getSecret("nope")).toBeNull();
  });
});
```

- [ ] **Step 2: `lib/secrets/crypto.ts`** — AES-256-GCM with key derived from `AUTH_TOKEN_SECRET`:

```ts
import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";
import { env } from "@/lib/env";

function key(): Buffer {
  return createHash("sha256").update(env().AUTH_TOKEN_SECRET).digest();
}

export function encrypt(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

export function decrypt(cipherText: string): string {
  const buf = Buffer.from(cipherText, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}
```

- [ ] **Step 3: queries + mutations**

```ts
// lib/secrets/queries.ts
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { secrets } from "@/lib/db/schema";
import { decrypt } from "./crypto";

export async function getSecret(key: string): Promise<string | null> {
  const [row] = await db.select().from(secrets).where(eq(secrets.key, key)).limit(1);
  if (!row) return null;
  return decrypt(row.cipherText);
}

export async function listSecretKeys(): Promise<string[]> {
  const rows = await db.select({ key: secrets.key }).from(secrets);
  return rows.map((r) => r.key);
}
```

```ts
// lib/secrets/mutations.ts
import { db } from "@/lib/db";
import { secrets } from "@/lib/db/schema";
import { encrypt } from "./crypto";

export async function setSecret(key: string, value: string): Promise<void> {
  const cipherText = encrypt(value);
  await db.insert(secrets).values({ key, cipherText }).onConflictDoUpdate({
    target: secrets.key,
    set: { cipherText, updatedAt: new Date() },
  });
}
```

- [ ] **Step 4: Run tests + commit**

```bash
pnpm test tests/secrets.test.ts
git add .
git commit -m "encrypted secrets (aes-256-gcm)"
```

---

### Task 3: External-call logger + backoff fetch

**Files:**
- Create: `lib/external/logger.ts`
- Create: `lib/external/fetch.ts`
- Create: `tests/fetch-backoff.test.ts`

- [ ] **Step 1: Logger**

```ts
// lib/external/logger.ts
import { db } from "@/lib/db";
import { externalCalls } from "@/lib/db/schema";

export async function logExternalCall(args: {
  service: string;
  endpoint: string;
  method: string;
  status?: number;
  durationMs: number;
  error?: string;
  request?: unknown;
  response?: unknown;
}): Promise<void> {
  await db.insert(externalCalls).values({
    service: args.service,
    endpoint: args.endpoint,
    method: args.method,
    status: args.status ?? null,
    durationMs: args.durationMs,
    error: args.error ?? null,
    requestSummary: args.request ?? null,
    responseSummary: args.response ?? null,
  });
}
```

- [ ] **Step 2: Backoff fetch**

```ts
// lib/external/fetch.ts
import { logExternalCall } from "./logger";

const DEFAULT_RETRIES = 4;
const BASE_DELAY_MS = 250;

export type FetchOpts = {
  service: string;
  retries?: number;
  redactRequest?: (init: RequestInit) => unknown;
  redactResponse?: (body: unknown) => unknown;
};

export async function fetchWithBackoff(url: string, init: RequestInit, opts: FetchOpts): Promise<Response> {
  const retries = opts.retries ?? DEFAULT_RETRIES;
  const started = Date.now();
  let lastErr: unknown;
  let lastStatus: number | undefined;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, init);
      lastStatus = res.status;
      if (res.status === 429 || res.status >= 500) {
        // honor Retry-After if present
        const retryAfter = parseRetryAfter(res.headers.get("retry-after"));
        const wait = retryAfter ?? BASE_DELAY_MS * Math.pow(2, attempt);
        if (attempt < retries) {
          await sleep(wait + Math.random() * 100);
          continue;
        }
      }
      await logExternalCall({
        service: opts.service,
        endpoint: url,
        method: init.method ?? "GET",
        status: res.status,
        durationMs: Date.now() - started,
        request: opts.redactRequest?.(init),
      });
      return res;
    } catch (err) {
      lastErr = err;
      if (attempt < retries) {
        await sleep(BASE_DELAY_MS * Math.pow(2, attempt));
        continue;
      }
    }
  }
  await logExternalCall({
    service: opts.service,
    endpoint: url,
    method: init.method ?? "GET",
    status: lastStatus,
    durationMs: Date.now() - started,
    error: lastErr instanceof Error ? lastErr.message : String(lastErr),
    request: opts.redactRequest?.(init),
  });
  throw new Error(`fetchWithBackoff exhausted retries for ${url}`);
}

function parseRetryAfter(v: string | null): number | null {
  if (!v) return null;
  const n = Number(v);
  if (!Number.isNaN(n)) return n * 1000;
  const at = Date.parse(v);
  return Number.isFinite(at) ? Math.max(0, at - Date.now()) : null;
}

function sleep(ms: number): Promise<void> { return new Promise((r) => setTimeout(r, ms)); }
```

- [ ] **Step 3: Test backoff behavior**

```ts
// tests/fetch-backoff.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchWithBackoff } from "@/lib/external/fetch";

beforeEach(() => { vi.restoreAllMocks(); });

describe("fetchWithBackoff", () => {
  it("retries on 429 then succeeds", async () => {
    let calls = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      calls++;
      if (calls < 3) return new Response("", { status: 429, headers: { "retry-after": "0" } });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }));
    const res = await fetchWithBackoff("http://x/y", { method: "GET" }, { service: "test" });
    expect(res.status).toBe(200);
    expect(calls).toBe(3);
  });

  it("returns the failing response after exhausting retries", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 500 })));
    await expect(
      fetchWithBackoff("http://x/y", { method: "GET" }, { service: "test", retries: 1 })
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 4: Test + commit**

```bash
pnpm test tests/fetch-backoff.test.ts
git add .
git commit -m "external logger + backoff fetch"
```

---

### Task 4: LLM client (OpenRouter)

**Files:**
- Create: `lib/llm/types.ts`
- Create: `lib/llm/client.ts`
- Create: `lib/llm/openrouter.ts`
- Create: `lib/llm/mock.ts`
- Create: `lib/llm/factory.ts`
- Create: `lib/llm/cache.ts`
- Create: `tests/llm.test.ts`

- [ ] **Step 1: Types** `lib/llm/types.ts`:

```ts
import { z } from "zod";

export const Message = z.object({
  role: z.enum(["system", "user", "assistant"]),
  content: z.string(),
  cache_control: z.object({ type: z.literal("ephemeral") }).optional(),
});
export type Message = z.infer<typeof Message>;

export const GenerateRequest = z.object({
  model: z.string(),
  messages: z.array(Message),
  temperature: z.number().min(0).max(2).optional(),
  max_tokens: z.number().int().positive().optional(),
  response_format: z.object({ type: z.literal("json_object") }).optional(),
});
export type GenerateRequest = z.infer<typeof GenerateRequest>;

export const GenerateResponse = z.object({
  id: z.string(),
  model: z.string(),
  text: z.string(),
  usage: z.object({
    input_tokens: z.number().int().nonnegative(),
    output_tokens: z.number().int().nonnegative(),
    cached_input_tokens: z.number().int().nonnegative().default(0),
    cost_usd: z.number().nonnegative().nullable(),
  }),
});
export type GenerateResponse = z.infer<typeof GenerateResponse>;
```

- [ ] **Step 2: Client interface** `lib/llm/client.ts`:

```ts
import type { GenerateRequest, GenerateResponse } from "./types";

export interface LLMClient {
  generate(req: GenerateRequest): Promise<GenerateResponse>;
}
```

- [ ] **Step 3: OpenRouter impl** `lib/llm/openrouter.ts`:

```ts
import type { LLMClient } from "./client";
import { fetchWithBackoff } from "@/lib/external/fetch";
import { GenerateRequest, GenerateResponse } from "./types";

const BASE = "https://openrouter.ai/api/v1";

export function makeOpenRouterClient(args: { apiKey: string; appUrl: string }): LLMClient {
  return {
    async generate(req) {
      const parsed = GenerateRequest.parse(req);
      const res = await fetchWithBackoff(`${BASE}/chat/completions`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${args.apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": args.appUrl,
          "X-Title": "Faye",
        },
        body: JSON.stringify({
          model: parsed.model,
          messages: parsed.messages,
          temperature: parsed.temperature,
          max_tokens: parsed.max_tokens,
          response_format: parsed.response_format,
          usage: { include: true },  // OpenRouter usage accounting
        }),
      }, { service: "llm" });
      if (!res.ok) throw new Error(`openrouter ${res.status}: ${await res.text()}`);
      const json = await res.json();
      const text = json.choices?.[0]?.message?.content ?? "";
      return GenerateResponse.parse({
        id: json.id,
        model: json.model,
        text,
        usage: {
          input_tokens: json.usage?.prompt_tokens ?? 0,
          output_tokens: json.usage?.completion_tokens ?? 0,
          cached_input_tokens: json.usage?.prompt_tokens_details?.cached_tokens ?? 0,
          cost_usd: json.usage?.cost ?? null,
        },
      });
    },
  };
}
```

- [ ] **Step 4: Mock + factory**

```ts
// lib/llm/mock.ts
import type { LLMClient } from "./client";

export function makeMockLLMClient(stub?: (req: any) => any): LLMClient {
  return {
    async generate(req) {
      const stubbed = stub?.(req);
      return stubbed ?? {
        id: "mock_1",
        model: req.model,
        text: "mock response",
        usage: { input_tokens: 10, output_tokens: 5, cached_input_tokens: 0, cost_usd: null },
      };
    },
  };
}
```

```ts
// lib/llm/factory.ts
import { env } from "@/lib/env";
import { getSecret } from "@/lib/secrets/queries";
import { makeOpenRouterClient } from "./openrouter";
import { makeMockLLMClient } from "./mock";
import type { LLMClient } from "./client";

export async function makeLLMClient(): Promise<LLMClient> {
  if (env().NODE_ENV === "test") return makeMockLLMClient();
  const apiKey = await getSecret("openrouter.api_key");
  if (!apiKey) throw new Error("missing secret: openrouter.api_key (set in /settings)");
  return makeOpenRouterClient({ apiKey, appUrl: env().APP_URL });
}
```

- [ ] **Step 5: Cache helpers** `lib/llm/cache.ts`:

```ts
import type { Message } from "./types";

/** Mark the artist-context block as ephemeral-cached. Last block in the array
 * before user/assistant turns gets the cache_control breakpoint. */
export function cacheArtistContext(block: Message): Message {
  return { ...block, cache_control: { type: "ephemeral" } };
}
```

- [ ] **Step 6: Test** `tests/llm.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { makeOpenRouterClient } from "@/lib/llm/openrouter";
import { makeMockLLMClient } from "@/lib/llm/mock";

describe("llm openrouter", () => {
  it("sends + parses response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      id: "or_1",
      model: "anthropic/claude-sonnet-4-6",
      choices: [{ message: { content: "hi" } }],
      usage: { prompt_tokens: 12, completion_tokens: 1, prompt_tokens_details: { cached_tokens: 8 }, cost: 0.0001 },
    }), { status: 200 })));
    const c = makeOpenRouterClient({ apiKey: "k", appUrl: "http://x" });
    const r = await c.generate({ model: "anthropic/claude-sonnet-4-6", messages: [{ role: "user", content: "hi" }] });
    expect(r.text).toBe("hi");
    expect(r.usage.cached_input_tokens).toBe(8);
  });
});

describe("llm mock", () => {
  it("returns default", async () => {
    const c = makeMockLLMClient();
    const r = await c.generate({ model: "x", messages: [] });
    expect(r.text).toBe("mock response");
  });
});
```

- [ ] **Step 7: Test + commit**

```bash
pnpm test tests/llm.test.ts
git add .
git commit -m "llm client (openrouter)"
```

---

### Task 5: Smartlink client (Feature.fm)

**Files:**
- Create: `lib/smartlink/types.ts`
- Create: `lib/smartlink/client.ts`
- Create: `lib/smartlink/featurefm.ts`
- Create: `lib/smartlink/mock.ts`
- Create: `lib/smartlink/factory.ts`
- Create: `tests/smartlink.test.ts`

Feature.fm exposes `Action Pages` (smartlinks) with click + conversion analytics. Endpoints are POSTed to `https://api.feature.fm/manage/v1`.

- [ ] **Step 1: Types** `lib/smartlink/types.ts`:

```ts
import { z } from "zod";

export const CreateSmartlinkInput = z.object({
  artistName: z.string(),
  releaseTitle: z.string(),
  spotifyTrackOrAlbumUrl: z.string().url(),
  slug: z.string().regex(/^[a-z0-9-]+$/).optional(),
});
export type CreateSmartlinkInput = z.infer<typeof CreateSmartlinkInput>;

export const Smartlink = z.object({
  id: z.string(),
  shortUrl: z.string().url(),
  longUrl: z.string().url().optional(),
});
export type Smartlink = z.infer<typeof Smartlink>;

export const SmartlinkMetrics = z.object({
  smartlinkId: z.string(),
  date: z.string(),                                  // YYYY-MM-DD
  clicks: z.number().int().nonnegative(),
  spotifyClicks: z.number().int().nonnegative(),
  estimatedStreams: z.number().int().nonnegative().nullable(),
});
export type SmartlinkMetrics = z.infer<typeof SmartlinkMetrics>;
```

- [ ] **Step 2: Interface**

```ts
// lib/smartlink/client.ts
import type { CreateSmartlinkInput, Smartlink, SmartlinkMetrics } from "./types";

export interface SmartlinkClient {
  create(input: CreateSmartlinkInput): Promise<Smartlink>;
  getDailyMetrics(args: { smartlinkId: string; date: string }): Promise<SmartlinkMetrics>;
}
```

- [ ] **Step 3: Feature.fm impl**

```ts
// lib/smartlink/featurefm.ts
import type { SmartlinkClient } from "./client";
import { fetchWithBackoff } from "@/lib/external/fetch";
import { Smartlink, SmartlinkMetrics, CreateSmartlinkInput } from "./types";

const BASE = "https://api.feature.fm/manage/v1";

export function makeFeatureFmClient(args: { apiKey: string }): SmartlinkClient {
  const auth = { "X-API-Key": args.apiKey, "Content-Type": "application/json" };

  return {
    async create(input) {
      const body = CreateSmartlinkInput.parse(input);
      const res = await fetchWithBackoff(`${BASE}/actionPages`, {
        method: "POST",
        headers: auth,
        body: JSON.stringify({
          artist: { name: body.artistName },
          title: body.releaseTitle,
          slug: body.slug,
          actions: [{ type: "service", service: "spotify", url: body.spotifyTrackOrAlbumUrl }],
        }),
      }, { service: "smartlink" });
      if (!res.ok) throw new Error(`featurefm create: ${res.status} ${await res.text()}`);
      const j = await res.json();
      return Smartlink.parse({ id: j.id, shortUrl: j.url ?? j.shortUrl, longUrl: j.longUrl });
    },

    async getDailyMetrics({ smartlinkId, date }) {
      const url = `${BASE}/analytics/actionPages/${smartlinkId}?from=${date}&to=${date}`;
      const res = await fetchWithBackoff(url, { method: "GET", headers: auth }, { service: "smartlink" });
      if (!res.ok) throw new Error(`featurefm metrics: ${res.status}`);
      const j = await res.json();
      return SmartlinkMetrics.parse({
        smartlinkId,
        date,
        clicks: j.totalClicks ?? 0,
        spotifyClicks: j.servicesClicks?.spotify ?? 0,
        estimatedStreams: j.spotifyEstimatedStreams ?? null,
      });
    },
  };
}
```

> Verify Feature.fm endpoint paths + field names against current docs before locking in — schema parsing will fail loudly if names differ.

- [ ] **Step 4: Mock + factory + test**

(same pattern as LLM: `lib/smartlink/mock.ts` returns stub data; `lib/smartlink/factory.ts` swaps based on `NODE_ENV` + `getSecret("featurefm.api_key")`.)

`tests/smartlink.test.ts` mocks `fetch` and asserts request body + response parsing for both `create` and `getDailyMetrics`.

- [ ] **Step 5: Commit**

```bash
pnpm test tests/smartlink.test.ts
git add .
git commit -m "smartlink client (feature.fm)"
```

---

### Task 6: Spotify client (Web + S4A)

**Files:** `lib/spotify/{types,client,web,s4a,mock,factory}.ts` + `tests/spotify.test.ts`.

**Interface:**

```ts
// lib/spotify/client.ts
export interface SpotifyClient {
  getArtistPopularity(artistId: string): Promise<{ popularity: number; followers: number }>;
  getTrack(trackId: string): Promise<{ id: string; title: string; popularity: number }>;
  /** Returns nullable streams: null when S4A unavailable for the artist. */
  getDailyStreams(args: { artistId: string; trackId?: string; date: string }):
    Promise<{ streams: number | null; listeners: number | null; source: "s4a" | "web_estimate" }>;
}
```

- **Web** impl (`lib/spotify/web.ts`): OAuth client-credentials flow for popularity/follower data. Always available.
- **S4A** impl (`lib/spotify/s4a.ts`): per-artist OAuth token (stored on `artists.spotifyForArtistsToken` from Plan 2). When token absent, the Spotify factory returns a client whose `getDailyStreams` returns `{ streams: null, listeners: null, source: "web_estimate" }` so callers can degrade composite scoring gracefully.

Detailed steps mirror Tasks 4-5: types → client interface → impl → mock → factory → tests. Implement the Spotify Web API client-credentials cache (token TTL 60min, in-memory) inline in `lib/spotify/web.ts`.

Commit at end: `spotify client (web + s4a)`.

---

### Task 7: FB Marketing API client

**Files:** `lib/fb/{types,client,real,mock,factory}.ts` + `tests/fb.test.ts`.

Use `facebook-nodejs-business-sdk`. Add dep:
```bash
pnpm add facebook-nodejs-business-sdk
```

**Interface** (narrow — what Faye actually needs):

```ts
export interface FBClient {
  createCampaign(input: { adAccountId: string; name: string; objective: "OUTCOME_TRAFFIC"; status: "PAUSED" | "ACTIVE"; }): Promise<{ id: string }>;
  createAdSet(input: {
    campaignId: string;
    name: string;
    dailyBudgetCents: number;
    targetingSpec: unknown;
    optimization: "LINK_CLICKS";
    startTime: Date;
    endTime?: Date;
    status: "PAUSED" | "ACTIVE";
  }): Promise<{ id: string }>;
  createAdCreative(input: {
    pageId: string;
    headline: string;
    primaryText: string;
    body: string;
    imageUrl: string;
    landingUrl: string;
  }): Promise<{ id: string }>;
  createAd(input: { adSetId: string; creativeId: string; name: string; status: "PAUSED" | "ACTIVE" }): Promise<{ id: string }>;
  pauseAd(adId: string): Promise<void>;
  archiveAd(adId: string): Promise<void>;
  setAdSetDailyBudget(adSetId: string, cents: number): Promise<void>;
  getAdInsights(adId: string, date: string): Promise<{
    spendCents: number;
    impressions: number;
    linkClicks: number;
    ctr: number;
    cpc: number;
  } | null>;
}
```

Each method uses the SDK with retry-via-`fetchWithBackoff` for HTTP-level errors. Wrap SDK exceptions and re-throw with `service: "fb"` info.

Mock returns deterministic fake IDs (`"fb_camp_<n>"`, etc.) and configurable insights.

`tests/fb.test.ts` exercises the mock (sufficient for v1) + uses the SDK's built-in mocking to assert one real call shape (campaign creation).

Commit: `fb marketing api client`.

---

### Task 8: Settings page — enter API keys + test connections

**Files:**
- Modify: `app/settings/page.tsx`
- Create: `app/settings/actions.ts`
- Create: `app/api/external/test/[service]/route.ts`

Settings page lists each secret key + a masked-value field + a "Test connection" button per service.

```tsx
// excerpt of app/settings/page.tsx
const KEYS = [
  { id: "fb.access_token", label: "Facebook Marketing API access token", testService: "fb" },
  { id: "fb.ad_account_id", label: "Facebook ad account ID (act_...)", testService: null },
  { id: "fb.page_id", label: "Default Facebook Page ID", testService: null },
  { id: "featurefm.api_key", label: "Feature.fm API key", testService: "smartlink" },
  { id: "spotify.client_id", label: "Spotify Web API client ID", testService: null },
  { id: "spotify.client_secret", label: "Spotify Web API client secret", testService: "spotify_web" },
  { id: "openrouter.api_key", label: "OpenRouter API key", testService: "llm" },
  { id: "resend.api_key", label: "Resend API key (override env)", testService: null },
];
```

Each key gets a form posting to `setSecretAction(key, value)`. The test-connection button hits `/api/external/test/<service>` which uses the factory + makes a minimal probe call (e.g. FB: `me/adaccounts`, Smartlink: GET on a known smartlink, OpenRouter: 1-token completion).

Commit: `settings page + test-connection probes`.

---

## Done

After Task 8:
- All external clients implemented + tested with mocks
- Real-mode credentials stored encrypted via Settings page
- Test-connection probes verify keys work
- `pnpm test` green across new tests; `pnpm typecheck` clean
- No real campaigns / ads / streams yet — that's Plan 4+

**Next plan:** Plan 4 — Campaign creation + manual publishing.
