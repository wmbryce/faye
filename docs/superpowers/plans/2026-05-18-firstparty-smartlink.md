# First-Party Smartlink Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Feature.fm as the smartlink backend with a Faye-owned shortcode redirect that logs per-click data to Postgres.

**Architecture:** Add two DB tables (`smartlinks`, `smartlink_clicks`), implement `SmartlinkClient` against them using base62 shortcodes, wire a public `/l/[shortcode]` redirect route, and swap the factory to return the first-party client in non-test environments.

**Tech Stack:** Drizzle ORM, Next.js App Router route handler, `crypto.randomBytes` (Node built-in, no extra dep), Vitest.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `lib/db/schema.ts` | Modify | Append `smartlinks` + `smartlinkClicks` table definitions |
| `drizzle/` | Auto-generated | Migration SQL from `pnpm db:generate` |
| `lib/smartlink/firstparty.ts` | Create | `makeFirstPartyClient` implementing `SmartlinkClient` |
| `lib/smartlink/factory.ts` | Modify | Return first-party client in non-test env; drop Feature.fm |
| `app/l/[shortcode]/route.ts` | Create | Public GET redirect handler with click logging |
| `middleware.ts` | Modify | Add `/l/` prefix to public bypass |
| `tests/setup.ts` | Modify | Add new tables to TRUNCATE list |
| `tests/firstparty-smartlink.test.ts` | Create | Unit/integration tests for `firstparty.ts` |
| `tests/smartlink-redirect.test.ts` | Create | Route handler tests |

---

### Task 1: Extend schema with `smartlinks` + `smartlink_clicks` tables

**Files:**
- Modify: `lib/db/schema.ts`
- Modify: `tests/setup.ts`

- [ ] **Step 1: Add tables to schema**

At the bottom of `lib/db/schema.ts`, before the `AD_STATUS` block, append:

```ts
export const smartlinks = pgTable("smartlinks", {
  id: text("id").primaryKey(),
  destinationUrl: text("destination_url").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const smartlinkClicks = pgTable("smartlink_clicks", {
  id: uuid("id").defaultRandom().primaryKey(),
  smartlinkId: text("smartlink_id").notNull().references(() => smartlinks.id, { onDelete: "cascade" }),
  clickedAt: timestamp("clicked_at", { withTimezone: true }).defaultNow().notNull(),
  userAgent: text("user_agent"),
}, (t) => ({
  smartlinkClickedIdx: index("smartlink_clicks_smartlink_clicked_idx").on(t.smartlinkId, t.clickedAt.desc()),
}));

export type Smartlink = typeof smartlinks.$inferSelect;
export type SmartlinkClick = typeof smartlinkClicks.$inferSelect;
```

Note: `lib/db/schema.ts` already exports a `Smartlink` type alias from `typeof campaigns.$inferSelect`. Check — it does NOT; it exports `Campaign`, `Audience`, etc. The `Smartlink` name from `lib/smartlink/types.ts` is a Zod type, not exported from schema. Adding `export type Smartlink` from schema is safe.

Wait — `lib/smartlink/types.ts` exports `Smartlink` as a Zod infer type and `lib/db/schema.ts` exports DB row types. They are separate modules with separate import paths. No collision.

- [ ] **Step 2: Add new tables to TRUNCATE in `tests/setup.ts`**

The TRUNCATE must list child tables before parents. `smartlink_clicks` references `smartlinks`, so truncate clicks first:

Replace the existing TRUNCATE line in `tests/setup.ts`:

Old:
```ts
  await sql`TRUNCATE TABLE sessions, external_calls, secrets, audit_log, llm_runs, consumed_reject_tokens, notifications, ad_metric_daily, release_metric_daily, ads, audiences, campaigns, audience_seeds, releases, assets, artists, users RESTART IDENTITY CASCADE`;
```

New:
```ts
  await sql`TRUNCATE TABLE smartlink_clicks, smartlinks, sessions, external_calls, secrets, audit_log, llm_runs, consumed_reject_tokens, notifications, ad_metric_daily, release_metric_daily, ads, audiences, campaigns, audience_seeds, releases, assets, artists, users RESTART IDENTITY CASCADE`;
```

- [ ] **Step 3: Generate + run migration**

```bash
cd /Users/williambryce/dev/faye && pnpm db:generate
```

Expected: new SQL file created in `drizzle/` (e.g. `0014_*.sql`) containing `CREATE TABLE smartlinks` and `CREATE TABLE smartlink_clicks`.

```bash
pnpm db:migrate
```

Expected: "Applying migration 0014_..." with no errors.

- [ ] **Step 4: Verify existing tests still pass**

```bash
pnpm test
```

Expected: 240 tests pass, 0 failures.

---

### Task 2: Implement `lib/smartlink/firstparty.ts`

**Files:**
- Create: `lib/smartlink/firstparty.ts`

- [ ] **Step 1: Write the failing test (placeholder — actual test is in Task 4)**

This task implements the module. Tests live in Task 4 and reference this file. Write the implementation now so Task 4 tests can import it.

- [ ] **Step 2: Create `lib/smartlink/firstparty.ts`**

```ts
import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { smartlinks, smartlinkClicks } from "@/lib/db/schema";
import { eq, and, gte, lt, count } from "drizzle-orm";
import type { SmartlinkClient } from "./client";
import { CreateSmartlinkInput } from "./types";

const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

function genShortcode(len = 8): string {
  const buf = randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) out += ALPHABET[buf[i] % ALPHABET.length];
  return out;
}

function nextDateISO(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function makeFirstPartyClient({ appUrl }: { appUrl: string }): SmartlinkClient {
  return {
    async create(input) {
      const { spotifyTrackOrAlbumUrl } = CreateSmartlinkInput.parse(input);

      for (let attempt = 0; attempt < 5; attempt++) {
        const id = genShortcode();
        const result = await db
          .insert(smartlinks)
          .values({ id, destinationUrl: spotifyTrackOrAlbumUrl })
          .onConflictDoNothing()
          .returning({ id: smartlinks.id });

        if (result.length > 0) {
          return {
            id,
            shortUrl: `${appUrl}/l/${id}`,
            longUrl: spotifyTrackOrAlbumUrl,
          };
        }
      }

      throw new Error("smartlink: failed to generate unique shortcode after 5 attempts");
    },

    async getDailyMetrics({ smartlinkId, date }) {
      const startOfDay = `${date}T00:00:00Z`;
      const startOfNextDay = `${nextDateISO(date)}T00:00:00Z`;

      const [row] = await db
        .select({ count: count() })
        .from(smartlinkClicks)
        .where(
          and(
            eq(smartlinkClicks.smartlinkId, smartlinkId),
            gte(smartlinkClicks.clickedAt, new Date(startOfDay)),
            lt(smartlinkClicks.clickedAt, new Date(startOfNextDay)),
          ),
        );

      const clicks = Number(row?.count ?? 0);
      return {
        smartlinkId,
        date,
        clicks,
        spotifyClicks: clicks,
        estimatedStreams: null,
      };
    },
  };
}
```

---

### Task 3: Swap factory + add middleware public path

**Files:**
- Modify: `lib/smartlink/factory.ts`
- Modify: `middleware.ts`

- [ ] **Step 1: Update `lib/smartlink/factory.ts`**

Replace full file contents:

```ts
import { env } from "@/lib/env";
import { makeFirstPartyClient } from "./firstparty";
import { makeMockSmartlinkClient } from "./mock";
import type { SmartlinkClient } from "./client";

export async function makeSmartlinkClient(): Promise<SmartlinkClient> {
  if (env().NODE_ENV === "test") return makeMockSmartlinkClient();
  return makeFirstPartyClient({ appUrl: env().APP_URL });
}
```

The `import { getSecret }` and `import { makeFeatureFmClient }` lines are removed. `featurefm.ts` file is untouched.

- [ ] **Step 2: Add `/l/` prefix to `middleware.ts` public bypass**

In `middleware.ts`, add `pathname.startsWith("/l/")` to the public-path check, alongside the existing `/reject/` pattern:

Replace:
```ts
    pathname === "/reject" ||
    pathname.startsWith("/reject/")
```

With:
```ts
    pathname === "/reject" ||
    pathname.startsWith("/reject/") ||
    pathname.startsWith("/l/")
```

- [ ] **Step 3: Typecheck**

```bash
cd /Users/williambryce/dev/faye && pnpm typecheck
```

Expected: no errors.

---

### Task 4: Write + run `tests/firstparty-smartlink.test.ts`

**Files:**
- Create: `tests/firstparty-smartlink.test.ts`

- [ ] **Step 1: Create the test file**

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { makeFirstPartyClient } from "@/lib/smartlink/firstparty";
import { db } from "@/lib/db";
import { smartlinks, smartlinkClicks } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const APP_URL = "https://faye.app";
const SPOTIFY_URL = "https://open.spotify.com/track/abc123";

const input = {
  artistName: "Hana Vu",
  releaseTitle: "Romanticism",
  spotifyTrackOrAlbumUrl: SPOTIFY_URL,
};

describe("firstparty smartlink client", () => {
  it("create returns 8-char shortcode + correct shortUrl + longUrl", async () => {
    const client = makeFirstPartyClient({ appUrl: APP_URL });
    const sl = await client.create(input);

    expect(sl.id).toHaveLength(8);
    expect(sl.id).toMatch(/^[0-9a-zA-Z]+$/);
    expect(sl.shortUrl).toBe(`${APP_URL}/l/${sl.id}`);
    expect(sl.longUrl).toBe(SPOTIFY_URL);
  });

  it("create writes a smartlinks row to the database", async () => {
    const client = makeFirstPartyClient({ appUrl: APP_URL });
    const sl = await client.create(input);

    const [row] = await db
      .select()
      .from(smartlinks)
      .where(eq(smartlinks.id, sl.id));

    expect(row).toBeDefined();
    expect(row.destinationUrl).toBe(SPOTIFY_URL);
  });

  it("create retries on PK collision and succeeds", async () => {
    // Insert a row with a known shortcode to force a collision on the first attempt
    await db.insert(smartlinks).values({ id: "AAAAAAAA", destinationUrl: SPOTIFY_URL });

    // Stub randomBytes to return the colliding code first, then a fresh one
    const crypto = await import("node:crypto");
    let callCount = 0;
    vi.spyOn(crypto, "randomBytes").mockImplementation((len: number) => {
      callCount++;
      if (callCount === 1) {
        // "AAAAAAAA" — index 10 in base62 alphabet is 'A'
        // buf[i] % 62 === 10 for all bytes => 'A'
        return Buffer.alloc(len as number, 10) as ReturnType<typeof crypto.randomBytes>;
      }
      // Second attempt: fresh random-looking bytes (all zeros => "00000000")
      return Buffer.alloc(len as number, 0) as ReturnType<typeof crypto.randomBytes>;
    });

    const client = makeFirstPartyClient({ appUrl: APP_URL });
    const sl = await client.create(input);

    expect(sl.id).toBe("00000000");
    expect(callCount).toBe(2);
    vi.restoreAllMocks();
  });

  it("getDailyMetrics returns 0 when no clicks", async () => {
    const client = makeFirstPartyClient({ appUrl: APP_URL });
    const sl = await client.create(input);

    const metrics = await client.getDailyMetrics({ smartlinkId: sl.id, date: "2026-05-18" });

    expect(metrics.clicks).toBe(0);
    expect(metrics.spotifyClicks).toBe(0);
    expect(metrics.estimatedStreams).toBeNull();
    expect(metrics.smartlinkId).toBe(sl.id);
    expect(metrics.date).toBe("2026-05-18");
  });

  it("getDailyMetrics counts only clicks on the requested date", async () => {
    const client = makeFirstPartyClient({ appUrl: APP_URL });
    const sl = await client.create(input);

    // 2 clicks on 2026-05-18, 1 click the day before, 1 click the day after
    await db.insert(smartlinkClicks).values([
      { smartlinkId: sl.id, clickedAt: new Date("2026-05-18T10:00:00Z") },
      { smartlinkId: sl.id, clickedAt: new Date("2026-05-18T22:00:00Z") },
      { smartlinkId: sl.id, clickedAt: new Date("2026-05-17T23:59:59Z") }, // day before
      { smartlinkId: sl.id, clickedAt: new Date("2026-05-19T00:00:00Z") }, // day after (boundary)
    ]);

    const metrics = await client.getDailyMetrics({ smartlinkId: sl.id, date: "2026-05-18" });

    expect(metrics.clicks).toBe(2);
    expect(metrics.spotifyClicks).toBe(2);
  });

  it("getDailyMetrics counts exact day boundary: midnight is start of day", async () => {
    const client = makeFirstPartyClient({ appUrl: APP_URL });
    const sl = await client.create(input);

    // Click exactly at midnight UTC — should count for 2026-05-18
    await db.insert(smartlinkClicks).values([
      { smartlinkId: sl.id, clickedAt: new Date("2026-05-18T00:00:00.000Z") },
    ]);

    const metrics = await client.getDailyMetrics({ smartlinkId: sl.id, date: "2026-05-18" });
    expect(metrics.clicks).toBe(1);
  });

  it("multiple smartlinks are isolated — clicks don't bleed across", async () => {
    const client = makeFirstPartyClient({ appUrl: APP_URL });
    const sl1 = await client.create(input);
    const sl2 = await client.create({ ...input, spotifyTrackOrAlbumUrl: "https://open.spotify.com/track/xyz" });

    await db.insert(smartlinkClicks).values([
      { smartlinkId: sl1.id, clickedAt: new Date("2026-05-18T10:00:00Z") },
      { smartlinkId: sl1.id, clickedAt: new Date("2026-05-18T11:00:00Z") },
      { smartlinkId: sl2.id, clickedAt: new Date("2026-05-18T12:00:00Z") },
    ]);

    const m1 = await client.getDailyMetrics({ smartlinkId: sl1.id, date: "2026-05-18" });
    const m2 = await client.getDailyMetrics({ smartlinkId: sl2.id, date: "2026-05-18" });

    expect(m1.clicks).toBe(2);
    expect(m2.clicks).toBe(1);
  });
});
```

- [ ] **Step 2: Run the tests**

```bash
cd /Users/williambryce/dev/faye && pnpm test tests/firstparty-smartlink.test.ts
```

Expected: 6 tests pass.

---

### Task 5: Create `app/l/[shortcode]/route.ts`

**Files:**
- Create: `app/l/[shortcode]/route.ts`

- [ ] **Step 1: Create directory and file**

```bash
mkdir -p /Users/williambryce/dev/faye/app/l/\[shortcode\]
```

- [ ] **Step 2: Write the route handler**

```ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { smartlinks, smartlinkClicks } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ shortcode: string }> },
) {
  const { shortcode } = await ctx.params;

  if (shortcode.length > 64 || !/^[A-Za-z0-9_-]+$/.test(shortcode)) {
    return new NextResponse("not found", { status: 404 });
  }

  const [row] = await db
    .select({ destinationUrl: smartlinks.destinationUrl })
    .from(smartlinks)
    .where(eq(smartlinks.id, shortcode))
    .limit(1);

  if (!row) return new NextResponse("not found", { status: 404 });

  const userAgent = req.headers.get("user-agent") ?? null;
  await db.insert(smartlinkClicks).values({ smartlinkId: shortcode, userAgent });

  return NextResponse.redirect(row.destinationUrl, { status: 302 });
}
```

---

### Task 6: Write + run `tests/smartlink-redirect.test.ts`

**Files:**
- Create: `tests/smartlink-redirect.test.ts`

- [ ] **Step 1: Create the test file**

```ts
import { describe, it, expect } from "vitest";
import { GET } from "@/app/l/[shortcode]/route";
import { db } from "@/lib/db";
import { smartlinks, smartlinkClicks } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const SPOTIFY_URL = "https://open.spotify.com/track/abc123";

async function makeCtx(shortcode: string) {
  return { params: Promise.resolve({ shortcode }) };
}

describe("GET /l/[shortcode]", () => {
  it("returns 404 for unknown shortcode", async () => {
    const req = new Request("http://localhost/l/notexist");
    const res = await GET(req, await makeCtx("notexist"));
    expect(res.status).toBe(404);
  });

  it("returns 404 for malformed shortcode (contains special chars)", async () => {
    const req = new Request("http://localhost/l/bad%20code");
    const res = await GET(req, await makeCtx("bad code"));
    expect(res.status).toBe(404);
  });

  it("returns 404 for shortcode exceeding 64 chars", async () => {
    const longCode = "a".repeat(65);
    const req = new Request(`http://localhost/l/${longCode}`);
    const res = await GET(req, await makeCtx(longCode));
    expect(res.status).toBe(404);
  });

  it("returns 302 redirect with correct Location for valid shortcode", async () => {
    await db.insert(smartlinks).values({ id: "abc12345", destinationUrl: SPOTIFY_URL });

    const req = new Request("http://localhost/l/abc12345");
    const res = await GET(req, await makeCtx("abc12345"));

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(SPOTIFY_URL);
  });

  it("records a click in smartlink_clicks", async () => {
    await db.insert(smartlinks).values({ id: "clickme1", destinationUrl: SPOTIFY_URL });

    const req = new Request("http://localhost/l/clickme1");
    await GET(req, await makeCtx("clickme1"));

    const rows = await db
      .select()
      .from(smartlinkClicks)
      .where(eq(smartlinkClicks.smartlinkId, "clickme1"));

    expect(rows).toHaveLength(1);
  });

  it("captures userAgent from request headers", async () => {
    await db.insert(smartlinks).values({ id: "agentme1", destinationUrl: SPOTIFY_URL });

    const req = new Request("http://localhost/l/agentme1", {
      headers: { "user-agent": "TestBrowser/1.0" },
    });
    await GET(req, await makeCtx("agentme1"));

    const [row] = await db
      .select()
      .from(smartlinkClicks)
      .where(eq(smartlinkClicks.smartlinkId, "agentme1"));

    expect(row.userAgent).toBe("TestBrowser/1.0");
  });

  it("records null userAgent when no header present", async () => {
    await db.insert(smartlinks).values({ id: "noagent1", destinationUrl: SPOTIFY_URL });

    const req = new Request("http://localhost/l/noagent1");
    await GET(req, await makeCtx("noagent1"));

    const [row] = await db
      .select()
      .from(smartlinkClicks)
      .where(eq(smartlinkClicks.smartlinkId, "noagent1"));

    expect(row.userAgent).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests**

```bash
cd /Users/williambryce/dev/faye && pnpm test tests/smartlink-redirect.test.ts
```

Expected: 6 tests pass.

---

### Task 7: Full verification + commit

- [ ] **Step 1: Run full test suite**

```bash
cd /Users/williambryce/dev/faye && pnpm test
```

Expected: ~252 tests pass (240 existing + 6 firstparty + 6 redirect), 0 failures.

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 3: Build**

```bash
pnpm build
```

Expected: build succeeds, no type errors, no missing imports.

- [ ] **Step 4: Commit**

```bash
git add lib/db/schema.ts lib/smartlink/firstparty.ts lib/smartlink/factory.ts app/l middleware.ts tests/setup.ts tests/firstparty-smartlink.test.ts tests/smartlink-redirect.test.ts drizzle/
git commit -m "first-party smartlink: shortcode redirect + click logging (drops Feature.fm)"
```

---

## Self-Review Checklist

- [x] Schema tables added with correct FK + index
- [x] `tests/setup.ts` TRUNCATE order: `smartlink_clicks` before `smartlinks` (child before parent)
- [x] `firstparty.ts` collision retry uses `onConflictDoNothing().returning()` — empty result = collision
- [x] `nextDateISO` handles month/year rollover correctly (uses `setUTCDate`)
- [x] Route handler: malformed shortcode check before DB query
- [x] Route handler: `await` on click insert (not fire-and-forget) — simpler and ~20ms in prod
- [x] Factory: `getSecret` import removed; `makeFeatureFmClient` import removed; `featurefm.ts` untouched
- [x] Middleware: `/l/` prefix added alongside `/reject/`
- [x] `Smartlink` type from `lib/db/schema.ts` doesn't clash — existing code imports `Smartlink` from `lib/smartlink/types.ts`, separate module path
- [x] No placeholders in any task
- [x] Method names consistent: `create`, `getDailyMetrics`, `makeFirstPartyClient` used uniformly
