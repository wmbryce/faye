# Faye Plan 6 — LLM Critique + Generate + Safety + Daily Cron Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Faye autonomously generates the next generation of ads each day per campaign. Three LLM passes (critique → generate → safety) produce N new variants per audience, staged as `pending` ads with `publish_at = now + reviewDelay`. Combined with Plan 5's publisher tick, this closes the autonomous loop.

**Architecture:** A `lib/loop/daily.ts` orchestrator runs per campaign per artist-timezone-09:00 via cron. Three LLM submodules (`critique.ts`, `generate.ts`, `safety.ts`) each define their prompt + response schema + run helper. Prompt caching: each call sends the artist context block (genre, voice guide, asset descriptions, recent press) with `cache_control: ephemeral` so subsequent calls reuse the prefix.

**Tech Stack:** Inherited + Plan 3 LLM client (OpenRouter). Per-task model selection from `secrets` (`llm.model.generate`, `llm.model.critique`, `llm.model.safety`) with sensible defaults.

**Spec:** `docs/superpowers/specs/2026-05-16-faye-design.md` §6 steps 4–9, §9 defaults (Sonnet 4.6 generate / Opus 4.7 critique / Haiku 4.5 safety).

---

## File Structure

```
faye/
  lib/db/schema.ts                # MODIFY: add llm_runs (per-call audit)
  drizzle/0005_*.sql

  lib/
    llm/
      runs.ts                     # write llm_runs row per call (input/output/cost)
      context.ts                  # build per-artist context block (cached prefix)
    loop/
      critique.ts                 # build + call + parse critique prompt
      generate.ts                 # build + call + parse generate prompt
      safety.ts                   # build + call + parse safety classifier
      asset-pick.ts               # pure: pick asset for a copy variant
      daily.ts                    # the orchestrator: ranks → critique → generate → safety → stage
    settings/
      defaults.ts                 # default models, K/N, review delay, weights

  scripts/
    daily.ts                      # `tsx scripts/daily.ts --campaign <id>` or `--all`

  tests/
    llm-context.test.ts
    loop-critique.test.ts
    loop-generate.test.ts
    loop-safety.test.ts
    loop-asset-pick.test.ts
    loop-daily.test.ts
```

---

### Task 1: Schema — llm_runs

```ts
export const llmRuns = pgTable("llm_runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  campaignId: uuid("campaign_id").references(() => campaigns.id, { onDelete: "set null" }),
  date: date("date").notNull(),
  kind: text("kind", { enum: ["critique", "generate", "safety"] }).notNull(),
  model: text("model").notNull(),
  inputTokens: integer("input_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0),
  cachedInputTokens: integer("cached_input_tokens").notNull().default(0),
  costCents: integer("cost_cents"),
  promptHash: text("prompt_hash").notNull(),
  output: jsonb("output"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
```

Migrate, update setup truncate, commit `schema: llm_runs`.

---

### Task 2: Artist context block + run logger

`lib/llm/context.ts`:
```ts
import type { Message } from "@/lib/llm/types";
import { listAssets } from "@/lib/assets/queries";
import { cacheArtistContext } from "@/lib/llm/cache";
import type { Artist, Release } from "@/lib/db/schema";

export async function buildArtistContextBlock(args: {
  artist: Artist;
  release: Release;
}): Promise<Message> {
  const assets = await listAssets(args.artist.id);
  const assetLines = assets.map((a) => `- ${a.label || "(unlabeled)"} (${a.kind})`).join("\n");
  const content = `# Artist
Name: ${args.artist.name}
Spotify ID: ${args.artist.spotifyArtistId}
Timezone: ${args.artist.timezone}

# Voice guide
${args.artist.voiceGuide || "(none provided)"}

# Release in this campaign
Title: ${args.release.title}
Kind: ${args.release.kind}
Release date: ${args.release.releaseDate}

# Assets available for ad creative
${assetLines || "(none)"}
`;
  return cacheArtistContext({ role: "system", content });
}
```

`lib/llm/runs.ts`:
```ts
import { db } from "@/lib/db";
import { llmRuns } from "@/lib/db/schema";
import { createHash } from "node:crypto";

export function promptHash(messages: { content: string }[]): string {
  return createHash("sha256").update(messages.map((m) => m.content).join("\n")).digest("hex").slice(0, 16);
}

export async function logLLMRun(args: {
  campaignId: string | null;
  date: string;
  kind: "critique" | "generate" | "safety";
  model: string;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  costCents: number | null;
  promptHash: string;
  output: unknown;
}) {
  await db.insert(llmRuns).values({
    ...args,
    costCents: args.costCents ?? null,
  });
}
```

Commit `llm context + run logger`.

---

### Task 3: Critique pass

`lib/loop/critique.ts`:
```ts
import type { LLMClient } from "@/lib/llm/client";
import type { Message } from "@/lib/llm/types";
import { promptHash, logLLMRun } from "@/lib/llm/runs";

export type CritiqueInput = {
  contextBlock: Message;
  survivors: { copyHeadline: string; copyPrimaryText: string; cpcCents: number; smartlinkClicks: number; smartlinkStreams: number | null }[];
  killed: { copyHeadline: string; copyPrimaryText: string; cpcCents: number; smartlinkClicks: number }[];
  campaignId: string;
  date: string;
  model: string;
};

export type CritiqueOutput = {
  winningThemes: string[];
  tiredThemes: string[];
  notes: string;
};

const SYSTEM_INSTRUCTIONS = `You analyze Facebook ad performance for a music artist's Spotify campaign.
You are given recent winning ads (low CPC, good clicks/streams) and recently killed ads (poor performance).
Output JSON: { "winningThemes": [up to 3 strings], "tiredThemes": [up to 3 strings], "notes": "max 200 chars" }.
Winning themes = angles, tones, hooks that work. Tired themes = avoid these.`;

export async function runCritique(client: LLMClient, input: CritiqueInput): Promise<CritiqueOutput> {
  const userText = formatCritiqueData(input);
  const messages: Message[] = [
    input.contextBlock,
    { role: "system", content: SYSTEM_INSTRUCTIONS },
    { role: "user", content: userText },
  ];
  const resp = await client.generate({
    model: input.model,
    messages,
    temperature: 0.2,
    response_format: { type: "json_object" },
    max_tokens: 600,
  });
  const parsed = JSON.parse(resp.text) as CritiqueOutput;
  await logLLMRun({
    campaignId: input.campaignId,
    date: input.date,
    kind: "critique",
    model: input.model,
    inputTokens: resp.usage.input_tokens,
    outputTokens: resp.usage.output_tokens,
    cachedInputTokens: resp.usage.cached_input_tokens,
    costCents: resp.usage.cost_usd != null ? Math.round(resp.usage.cost_usd * 100) : null,
    promptHash: promptHash(messages),
    output: parsed,
  });
  return parsed;
}

function formatCritiqueData(i: CritiqueInput): string {
  const fmt = (a: any) => `[CPC ${a.cpcCents}¢, clicks ${a.smartlinkClicks}${a.smartlinkStreams != null ? `, streams ${a.smartlinkStreams}` : ""}] ${a.copyHeadline} — ${a.copyPrimaryText}`;
  return `Winners (keep doing this):\n${i.survivors.map(fmt).join("\n") || "(none yet)"}\n\nKilled (avoid these patterns):\n${i.killed.map(fmt).join("\n") || "(none yet)"}`;
}
```

Tests: provide a stubbed LLMClient via `makeMockLLMClient((req) => ({ ...returns JSON... }))` and assert the parsed output + that `llmRuns` got a row.

Commit `critique pass`.

---

### Task 4: Generate pass

`lib/loop/generate.ts`:
```ts
import type { LLMClient } from "@/lib/llm/client";
import type { Message } from "@/lib/llm/types";
import { promptHash, logLLMRun } from "@/lib/llm/runs";
import type { CritiqueOutput } from "./critique";

export type GenerateInput = {
  contextBlock: Message;
  critique: CritiqueOutput;
  audienceDescription: string;
  n: number;
  campaignId: string;
  date: string;
  model: string;
};

export type AdVariant = {
  copyHeadline: string;      // max 40 chars
  copyPrimaryText: string;   // <=125 chars target
  copyBody: string;
  assetHint: string;          // hint matching an asset label, or "any"
};

const SYSTEM_INSTRUCTIONS = `You write Facebook ad copy for a music artist's Spotify campaign.
Output JSON: { "variants": [ { "copyHeadline": "<=40 chars", "copyPrimaryText": "<=125 chars", "copyBody": "<=200 chars", "assetHint": "string matching an asset label or 'any'" } ] }.
- Each variant explores a DIFFERENT angle but stays in the winning voice.
- No false claims, no superlatives that imply guaranteed results, no targeting of personal attributes (age/gender/health).`;

export async function runGenerate(client: LLMClient, input: GenerateInput): Promise<AdVariant[]> {
  const userText = `Audience: ${input.audienceDescription}
Winning themes: ${input.critique.winningThemes.join("; ") || "(none yet — explore freely)"}
Tired themes (avoid): ${input.critique.tiredThemes.join("; ") || "(none yet)"}
Notes: ${input.critique.notes}
Write ${input.n} variants.`;
  const messages: Message[] = [
    input.contextBlock,
    { role: "system", content: SYSTEM_INSTRUCTIONS },
    { role: "user", content: userText },
  ];
  const resp = await client.generate({
    model: input.model,
    messages,
    temperature: 0.9,
    response_format: { type: "json_object" },
    max_tokens: 1200,
  });
  const parsed = JSON.parse(resp.text) as { variants: AdVariant[] };
  await logLLMRun({
    campaignId: input.campaignId,
    date: input.date,
    kind: "generate",
    model: input.model,
    inputTokens: resp.usage.input_tokens,
    outputTokens: resp.usage.output_tokens,
    cachedInputTokens: resp.usage.cached_input_tokens,
    costCents: resp.usage.cost_usd != null ? Math.round(resp.usage.cost_usd * 100) : null,
    promptHash: promptHash(messages),
    output: parsed,
  });
  return (parsed.variants ?? []).slice(0, input.n);
}
```

Tests: stub returns N variants, assert truncation to N, length-guards for fields are validated (a follow-up sanitization step can chop too-long strings — add a post-process inside `runGenerate` if you want strict enforcement).

Commit `generate pass`.

---

### Task 5: Safety classifier

`lib/loop/safety.ts`:
```ts
import type { LLMClient } from "@/lib/llm/client";
import type { Message } from "@/lib/llm/types";
import { promptHash, logLLMRun } from "@/lib/llm/runs";
import type { AdVariant } from "./generate";

export type SafetyVerdict = { variantIndex: number; ok: boolean; reasons: string[] };

const SYSTEM_INSTRUCTIONS = `You are a Meta ad-policy compliance classifier. Given an ad variant, return { ok: bool, reasons: string[] }.
Reasons to fail: false claims; superlatives implying guaranteed results; targeting of personal attributes (age/gender/race/health/finances); promises of "results" or "free money"; deceptive scarcity ("only today").`;

export async function runSafety(client: LLMClient, args: {
  variants: AdVariant[];
  campaignId: string;
  date: string;
  model: string;
  contextBlock: Message;
}): Promise<SafetyVerdict[]> {
  const verdicts: SafetyVerdict[] = [];
  for (let i = 0; i < args.variants.length; i++) {
    const v = args.variants[i];
    const messages: Message[] = [
      args.contextBlock,
      { role: "system", content: SYSTEM_INSTRUCTIONS },
      { role: "user", content: `Headline: ${v.copyHeadline}\nPrimary: ${v.copyPrimaryText}\nBody: ${v.copyBody}\nReturn JSON: { "ok": bool, "reasons": [strings] }` },
    ];
    const resp = await client.generate({
      model: args.model,
      messages,
      temperature: 0,
      response_format: { type: "json_object" },
      max_tokens: 200,
    });
    const parsed = JSON.parse(resp.text) as { ok: boolean; reasons: string[] };
    verdicts.push({ variantIndex: i, ok: parsed.ok, reasons: parsed.reasons ?? [] });
    await logLLMRun({
      campaignId: args.campaignId,
      date: args.date,
      kind: "safety",
      model: args.model,
      inputTokens: resp.usage.input_tokens,
      outputTokens: resp.usage.output_tokens,
      cachedInputTokens: resp.usage.cached_input_tokens,
      costCents: resp.usage.cost_usd != null ? Math.round(resp.usage.cost_usd * 100) : null,
      promptHash: promptHash(messages),
      output: parsed,
    });
  }
  return verdicts;
}
```

Tests with mock LLM returning alternating ok/not-ok JSON. Optionally batch into one call if cost matters, but per-variant is simpler and clear.

Commit `safety classifier`.

---

### Task 6: Asset pick (pure)

```ts
// lib/loop/asset-pick.ts
import type { Asset } from "@/lib/db/schema";

export function pickAsset(
  variantHint: string,
  assets: Asset[],
  rotationKey: number
): Asset | null {
  if (assets.length === 0) return null;
  if (variantHint && variantHint !== "any") {
    const match = assets.find((a) => a.label.toLowerCase().includes(variantHint.toLowerCase()));
    if (match) return match;
  }
  // round-robin fallback
  return assets[rotationKey % assets.length];
}
```

Tests: hint matches → returns that asset; no match → round-robin.

Commit `asset pick`.

---

### Task 7: Daily orchestrator

`lib/loop/daily.ts` brings it together. Steps:

1. Resolve campaign + artist + release; build `contextBlock` (cached prefix).
2. List audiences for the campaign.
3. For each audience:
   a. Pull yesterday's `ad_metric_daily` rows for ads in this audience (from Plan 5).
   b. Compute survivors (top-K by composite) + killed (bottom group).
   c. Run `critique` (one per audience, since the data differs).
   d. Run `generate` for N variants.
   e. Run `safety`; drop variants where `ok=false`.
   f. Stage `ad` rows: status `pending`, `publishAt = now + reviewDelay` (from settings or default 30min), `assetId` from `pickAsset`, `parentAdId` = top-1 survivor if any, `generation = campaign.currentGen + 1`.
4. Bump campaign generation counter.

```ts
export async function runDailyLoop(args: { campaignId: string; now?: Date }) {
  const now = args.now ?? new Date();
  // ... read defaults from secrets ("llm.model.generate", etc.) with built-in fallbacks
  // ... cold start (gens 0-3) is detected by maxGenerationSoFar; if cold, skip pruning but still generate
}
```

Long; mirror the spec §6 step ordering. Test exercises the full happy-path against mock LLM + DB-only side effects (no FB calls — those happen in `publisherTick`). Assert N new `pending` rows per audience and one llm_run per pass per audience.

Commit `daily orchestrator`.

---

### Task 8: Cron entrypoint + per-tz scheduling

`scripts/daily.ts`:
```ts
import "dotenv/config";
import { db } from "@/lib/db";
import { campaigns } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { runDailyLoop } from "@/lib/loop/daily";

const arg = process.argv[2];
if (arg === "--all") {
  // intended to be invoked hourly by cron; only runs for campaigns whose
  // local time is between 09:00 and 09:59. This collapses 24 tz buckets
  // into a single crontab line.
  const all = await db.select().from(campaigns).where(eq(campaigns.status, "active"));
  for (const c of all) {
    const local = new Date().toLocaleTimeString("en-US", { hour12: false, timeZone: c.timezone });
    const hour = parseInt(local.slice(0, 2), 10);
    if (hour === 9) await runDailyLoop({ campaignId: c.id });
  }
} else if (arg?.startsWith("--campaign=")) {
  await runDailyLoop({ campaignId: arg.slice("--campaign=".length) });
}
process.exit(0);
```

Append to `deploy/cron.example`:
```
0 * * * * cd /opt/faye && /usr/bin/pnpm exec tsx scripts/daily.ts --all >> /var/log/faye/daily.log 2>&1
```

Commit `daily cron + per-tz scheduling`.

---

### Task 9: Cold-start handling

`runDailyLoop` accepts a `coldStartGens=4` setting (default). When campaign's max generation < coldStartGens:
- Skip pruning of any ad except those with `>=1000 impressions AND 0 clicks` (mark as `killed`)
- Skip critique (no winners yet) — generate purely from artist context + audience description
- Generate N variants per audience as usual
- Stage as pending

Add a unit test for cold-start behavior: no `ad_metric_daily` rows + generation=0 → still produces N pending ads.

Commit `cold start`.

---

### Task 10: Manual trigger UI

Add a "Run daily loop now" button on campaign detail page that POSTs to `/api/admin/run-daily/[campaignId]` (operator-only). Useful for testing on demand without waiting for cron.

Commit `manual daily trigger`.

---

## Done

After Task 10:
- Faye autonomously generates next-gen ads each morning (or on manual trigger)
- Three LLM passes recorded in `llm_runs` for cost auditing
- Cold-start handling prevents premature pruning
- Cron scheduling respects per-artist timezone
- Combined with publisher tick (Plan 5), the autonomous loop is live — but ads still publish without operator review notification (Plan 7)

**Next plan:** Plan 7 — Email digest + approve/reject flow.
