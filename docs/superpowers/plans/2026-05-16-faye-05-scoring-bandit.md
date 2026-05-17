# Faye Plan 5 — Composite Scoring + Bandit + Publisher Tick Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Faye pulls yesterday's metrics, scores each ad on the composite (0.6/0.2/0.2), runs the bandit (keep top K, prune the rest, reweight per-audience budget), and publishes any due-but-not-yet-pushed ads on a 5-min publisher tick. Still manual ad creation — generative step is Plan 6.

**Architecture:** Pure-function scoring + bandit modules (no I/O) so they're trivial to unit-test. A thin orchestration layer pulls metrics from FB + Feature.fm + Spotify clients, writes `ad_metric_daily` + `release_metric_daily` rows, then runs scoring/bandit. The publisher tick is a separate CLI entrypoint (`scripts/publish-tick.ts`) scheduled by system cron every 5 min.

**Tech Stack:** Inherited TS / Drizzle. Pure-fn math (no extra libs).

**Spec:** `docs/superpowers/specs/2026-05-16-faye-design.md` §3 (composite + degraded fallbacks), §6 (daily loop steps 1–4 + steps 7 publisher tick + step 10 audience budget reweighting), §9 defaults.

---

## File Structure

```
faye/
  lib/db/schema.ts                # MODIFY: add ad_metric_daily, release_metric_daily
  drizzle/0004_*.sql

  lib/
    composite/
      score.ts                    # pure: compute composite per cohort
      normalize.ts                # pure: rank-based normalize
      fraud.ts                    # pure: flag suspicious ads
    bandit/
      prune.ts                    # pure: pick survivors per audience, pause bottom
      audience-budget.ts          # pure: EXP3-style reweighting with ±20% cap
    metrics/
      pull.ts                     # I/O: pull FB + smartlink + spotify, write rows
    publisher/
      tick.ts                     # I/O: find pending ads ready to publish + publish

  scripts/
    publish-tick.ts               # `tsx scripts/publish-tick.ts`
    metrics-pull.ts               # `tsx scripts/metrics-pull.ts --campaign <id>`
    bandit-step.ts                # `tsx scripts/bandit-step.ts --campaign <id>`

  tests/
    composite-score.test.ts
    composite-normalize.test.ts
    fraud.test.ts
    bandit-prune.test.ts
    bandit-audience-budget.test.ts
    metrics-pull.test.ts
    publisher-tick.test.ts
```

---

### Task 1: Schema — ad_metric_daily, release_metric_daily

```ts
export const adMetricDaily = pgTable("ad_metric_daily", {
  id: uuid("id").defaultRandom().primaryKey(),
  adId: uuid("ad_id").notNull().references(() => ads.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  spendCents: integer("spend_cents").notNull().default(0),
  impressions: integer("impressions").notNull().default(0),
  fbLinkClicks: integer("fb_link_clicks").notNull().default(0),
  smartlinkClicks: integer("smartlink_clicks").notNull().default(0),
  smartlinkStreams: integer("smartlink_streams"),
  compositeScore: real("composite_score"),
  excludedReason: text("excluded_reason"),     // 'low_impressions' | 'fraud_suspected'
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ unq: unique().on(t.adId, t.date) }));

export const releaseMetricDaily = pgTable("release_metric_daily", {
  id: uuid("id").defaultRandom().primaryKey(),
  releaseId: uuid("release_id").notNull().references(() => releases.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  spotifyStreams: integer("spotify_streams"),
  spotifyListeners: integer("spotify_listeners"),
  source: text("source", { enum: ["s4a", "web_estimate"] }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ unq: unique().on(t.releaseId, t.date) }));
```

(Import `real` and `unique` from `drizzle-orm/pg-core`.)

Migrate, update `tests/setup.ts` truncate list, commit `schema: ad/release metric daily`.

---

### Task 2: Pure normalization

```ts
// lib/composite/normalize.ts
export function rankNormalize(values: number[]): number[] {
  // returns z-like value in [-1, 1] based on rank: best=+1, worst=-1
  const n = values.length;
  if (n === 0) return [];
  if (n === 1) return [0];
  const indexed = values.map((v, i) => ({ v, i }));
  indexed.sort((a, b) => a.v - b.v);
  const out = new Array<number>(n);
  for (let k = 0; k < n; k++) {
    out[indexed[k].i] = (2 * k) / (n - 1) - 1;
  }
  return out;
}
```

Test cases: empty, singleton, [10,20,30] → [-1,0,1], ties handled (rank by position; documented limitation).

Commit `pure normalize`.

---

### Task 3: Composite score

```ts
// lib/composite/score.ts
import { rankNormalize } from "./normalize";

export type AdSnapshot = {
  adId: string;
  spendCents: number;
  impressions: number;
  fbLinkClicks: number;
  smartlinkClicks: number;
  smartlinkStreams: number | null;
  releaseStreamDelta: number | null;  // streams above baseline for the release that day
  releaseClicksTotal: number;          // sum of smartlinkClicks across all ads in same release-day for apportioning
};

export type ScoredAd = { adId: string; score: number | null; excludedReason?: "low_impressions" | "fraud_suspected" };

export const MIN_IMPRESSIONS = 500;

export function scoreCohort(
  ads: AdSnapshot[],
  opts: { weights?: { cpc?: number; streamCredit?: number; streamPerClick?: number } } = {}
): ScoredAd[] {
  // 1. exclude low-impression ads (kept alive, not ranked)
  const eligible: AdSnapshot[] = [];
  const excluded: ScoredAd[] = [];
  for (const a of ads) {
    if (a.impressions < MIN_IMPRESSIONS) excluded.push({ adId: a.adId, score: null, excludedReason: "low_impressions" });
    else eligible.push(a);
  }
  if (eligible.length === 0) return excluded;

  // 2. compute three signals
  const cpc = eligible.map((a) => a.fbLinkClicks > 0 ? a.spendCents / a.fbLinkClicks : Number.POSITIVE_INFINITY);
  const streamCredit = eligible.map((a) => {
    if (a.releaseStreamDelta == null || a.releaseClicksTotal === 0) return 0;
    return a.releaseStreamDelta * (a.smartlinkClicks / a.releaseClicksTotal);
  });
  const streamPerClick = eligible.map((a) => {
    const denom = a.smartlinkClicks > 0 ? a.smartlinkClicks : a.fbLinkClicks;
    if (denom === 0) return 0;
    const streams = a.smartlinkStreams ?? 0;
    return streams / denom;
  });

  // 3. detect availability of signals (degraded mode)
  const haveStreamCredit = eligible.some((a) => a.releaseStreamDelta != null);
  const haveStreamPerClick = eligible.some((a) => a.smartlinkStreams != null);

  const W = opts.weights ?? { cpc: 0.6, streamCredit: 0.2, streamPerClick: 0.2 };
  let { cpc: wCpc, streamCredit: wSC, streamPerClick: wSPC } = { cpc: 0.6, streamCredit: 0.2, streamPerClick: 0.2, ...W };
  if (!haveStreamCredit && !haveStreamPerClick) { wCpc = 1; wSC = 0; wSPC = 0; }
  else if (!haveStreamCredit) { wCpc = 0.6; wSPC = 0.4; wSC = 0; }
  else if (!haveStreamPerClick) { wCpc = 0.6; wSC = 0.4; wSPC = 0; }

  // 4. normalize (negate cpc since lower is better)
  const nCpc = rankNormalize(cpc.map((v) => -v));
  const nSC = rankNormalize(streamCredit);
  const nSPC = rankNormalize(streamPerClick);

  const scored: ScoredAd[] = eligible.map((a, i) => ({
    adId: a.adId,
    score: wCpc * nCpc[i] + wSC * nSC[i] + wSPC * nSPC[i],
  }));
  return [...scored, ...excluded];
}
```

Tests:
- Three ads with diff CPC → ranked by CPC when no stream data
- Stream-per-click signal present → composite weights apply
- Low-impression ad excluded with reason
- All `streamPerClick` absent → composite reduces to CPC only

Commit `composite score`.

---

### Task 4: Fraud filter

```ts
// lib/composite/fraud.ts
import type { AdSnapshot } from "./score";

export function fraudFlag(ad: AdSnapshot): boolean {
  if (ad.impressions === 0) return false;
  const ctr = ad.fbLinkClicks / ad.impressions;
  const cpcCents = ad.fbLinkClicks > 0 ? ad.spendCents / ad.fbLinkClicks : Number.POSITIVE_INFINITY;
  const noStreams = (ad.smartlinkStreams ?? 0) === 0 && (ad.releaseStreamDelta ?? 0) <= 0;
  return ctr > 0.10 && cpcCents < 5 && noStreams;
}
```

Test cases per the spec definition.

Commit `fraud heuristic`.

---

### Task 5: Bandit prune

```ts
// lib/bandit/prune.ts
import type { ScoredAd } from "@/lib/composite/score";

export type PruneInput = { audienceId: string; scored: ScoredAd[]; K: number };
export type PruneResult = { adId: string; action: "keep" | "pause" | "keep_exploring" }[];

export function prune({ scored, K }: PruneInput): PruneResult {
  const exploring = scored.filter((s) => s.excludedReason === "low_impressions").map((s) => ({ adId: s.adId, action: "keep_exploring" as const }));
  const ranked = scored.filter((s) => s.score !== null).sort((a, b) => (b.score! - a.score!));
  const result: PruneResult = [...exploring];
  ranked.forEach((s, idx) => {
    result.push({ adId: s.adId, action: idx < K ? "keep" : "pause" });
  });
  return result;
}
```

Tests verify K=3 keeps top 3, pauses rest, exploring ads kept.

Commit `bandit prune`.

---

### Task 6: Audience-budget reweighting (EXP3-style, capped)

```ts
// lib/bandit/audience-budget.ts
const SHIFT_CAP = 0.20;
const ETA = 0.30;  // learning rate

export type AudienceScore = { audienceId: string; meanScore: number; currentBudgetCents: number };
export type AudienceBudgetResult = { audienceId: string; newBudgetCents: number }[];

export function reweighAudienceBudgets(
  scores: AudienceScore[],
  totalDailyBudgetCents: number
): AudienceBudgetResult {
  if (scores.length === 0) return [];
  if (scores.length === 1) return [{ audienceId: scores[0].audienceId, newBudgetCents: totalDailyBudgetCents }];

  // multiplicative weights
  const exps = scores.map((s) => Math.exp(ETA * s.meanScore));
  const sum = exps.reduce((a, b) => a + b, 0);
  const proposed = exps.map((e, i) => ({ id: scores[i].audienceId, share: e / sum, current: scores[i].currentBudgetCents }));

  // cap ±20% shift from current share
  const currentShareSum = scores.reduce((a, b) => a + b.currentBudgetCents, 0);
  return proposed.map(({ id, share, current }) => {
    const currentShare = currentShareSum > 0 ? current / currentShareSum : 1 / scores.length;
    const cappedShare = Math.max(currentShare * (1 - SHIFT_CAP), Math.min(currentShare * (1 + SHIFT_CAP), share));
    return { audienceId: id, newBudgetCents: Math.round(cappedShare * totalDailyBudgetCents) };
  });
}
```

Tests:
- Equal scores → near-equal split
- One dominant audience → it gains but no more than +20% over current share
- One losing audience → it drops but no more than -20%
- Sum of new budgets approximately equals total (allow ±2 cents rounding error in test)

Commit `bandit audience budget`.

---

### Task 7: Metrics pull orchestration

`lib/metrics/pull.ts` orchestrates one campaign's daily metrics pull:
1. List `ad.status='published'` for campaign
2. For each ad, `fb.getAdInsights(adId, date)` → spend / impressions / fb_link_clicks
3. Smartlink: `sl.getDailyMetrics({ smartlinkId: campaign.smartlinkId, date })` once per campaign-day (results apply across ads via apportioning — we store totals at the campaign level via per-ad split; for simplicity, smartlinkClicks per ad = total * (fbLinkClicks / ΣfbLinkClicks))
4. Spotify: `spotify.getDailyStreams({ artistId, trackId, date })` → upsert `release_metric_daily`
5. Compute baseline = mean of last 7 release-day streams pre-campaign-start. Cache on the release row (add `streamBaseline` integer column in a small migration if not present, or compute lazily each pull).
6. Write `ad_metric_daily` rows for each ad

Mock all three clients; the orchestrator's test asserts written DB rows and correct apportioning math.

Commit `metrics pull orchestrator`.

---

### Task 8: Bandit step orchestration

`lib/bandit/step.ts` orchestrates one campaign's bandit step:
1. Read yesterday's `ad_metric_daily` rows for campaign
2. Compute `AdSnapshot` per ad, including `releaseStreamDelta = streamsYesterday - streamBaseline`
3. Run `scoreCohort` per audience
4. Run `fraudFlag`; mark scored rows with `excludedReason='fraud_suspected'` (and exclude from ranking) — write back to `ad_metric_daily`
5. Run `prune` per audience; for each `pause` action, mark ad status `paused` + call `fb.pauseAd`
6. Every 3rd generation: also mark old paused ads as `killed` + `fb.archiveAd`
7. Compute audience mean scores; run `reweighAudienceBudgets`; update each `audience.dailyBudgetCents` + `fb.setAdSetDailyBudget`
8. Bump campaign's current generation counter (add `currentGen integer` to campaign row in migration; or derive max from ads)

Test cases focus on the orchestration: with synthetic input rows, assert correct status transitions + FB calls (via mock).

Commit `bandit step orchestrator`.

---

### Task 9: Publisher tick

```ts
// lib/publisher/tick.ts
import { db } from "@/lib/db";
import { ads, campaigns, audiences } from "@/lib/db/schema";
import { and, eq, lte, isNull } from "drizzle-orm";
import { publishAd } from "@/lib/ads/mutations";

export async function publisherTick(now: Date = new Date()): Promise<{ published: number; errors: number }> {
  const rows = await db.select({ id: ads.id })
    .from(ads)
    .where(and(eq(ads.status, "pending"), lte(ads.publishAt, now)));
  let published = 0;
  let errors = 0;
  for (const { id } of rows) {
    try { await publishAd(id); published++; } catch { errors++; }
  }
  return { published, errors };
}
```

`scripts/publish-tick.ts`:
```ts
import "dotenv/config";
import { publisherTick } from "@/lib/publisher/tick";

const r = await publisherTick();
console.log(`published=${r.published} errors=${r.errors}`);
process.exit(0);
```

Test: stage a couple of `pending` ads with `publishAt` in the past + one in the future → tick publishes the past ones only.

Commit `publisher tick`.

---

### Task 10: Cron entrypoints documented + dev runner

Add an admin-only `/admin/run/[script]` POST endpoint that, with operator session, invokes the orchestrator scripts directly (for dev). Production uses crontab on the VPS.

Append to `deploy/cron.example`:
```
*/5 * * * * cd /opt/faye && /usr/bin/pnpm exec tsx scripts/publish-tick.ts >> /var/log/faye/publish.log 2>&1
0 9 * * * cd /opt/faye && /usr/bin/pnpm exec tsx scripts/metrics-pull.ts --all >> /var/log/faye/metrics.log 2>&1
30 9 * * * cd /opt/faye && /usr/bin/pnpm exec tsx scripts/bandit-step.ts --all >> /var/log/faye/bandit.log 2>&1
```

Commit `cron + dev runner endpoints`.

---

## Done

After Task 10:
- Composite scoring + fraud filter + bandit prune + audience-budget reweighting fully tested as pure functions
- Metrics pulled from FB + Feature.fm + Spotify (mocked in tests, real in dev) into `ad_metric_daily` + `release_metric_daily`
- Bandit step transitions ad statuses + calls FB to pause/archive
- Publisher tick auto-publishes due pending ads
- Cron entries documented

**Next plan:** Plan 6 — LLM critique + generate + safety + daily cron loop.
