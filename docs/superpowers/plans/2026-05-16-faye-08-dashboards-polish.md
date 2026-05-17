# Faye Plan 8 — Dashboards + Cost Tracking + Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Operator can see what Faye is doing and how well it's working. Charts (spend vs streams over time), per-ad performance tables, cost dashboards (ad spend + LLM cost + infra), audit log viewer, degraded-data flags surfaced everywhere. Bring the rough edges down: error pages, loading states, FB ad-disapproval webhook, nightly backup script.

**Architecture:** Read-only views over data Plans 4–7 produce. Charts via Recharts. Server components do all queries; client components only for chart interactivity. A new `lib/costs/` module aggregates spend + LLM cost. FB disapproval webhook moves an ad to `rejected` and surfaces a banner on campaign detail.

**Tech Stack:** Inherited + `recharts`.

**Spec:** `docs/superpowers/specs/2026-05-16-faye-design.md` §8 (web UI scope), §10 (operational risks).

---

## File Structure

```
faye/
  lib/
    costs/
      aggregate.ts                # sum ad spend + llm cost per day per campaign
    metrics/
      timeseries.ts               # query helpers for charts
  app/
    campaigns/[id]/
      page.tsx                    # MODIFY: charts + summary
      ads/page.tsx                # MODIFY: rich ad table
      audit/page.tsx              # generic audit viewer
      costs/page.tsx              # spend + llm cost breakdown
    api/
      fb/webhook/route.ts         # FB ad disapproval webhook
  components/
    charts/
      spend-streams-chart.tsx
      composite-chart.tsx
      audience-budget-chart.tsx
    ad-table.tsx
    degraded-banner.tsx
  deploy/
    backup.sh                     # pg_dump → b2 cron script
  tests/
    costs.test.ts
    timeseries.test.ts
    fb-webhook.test.ts
```

---

### Task 1: Recharts setup + cost aggregator

```bash
pnpm add recharts
```

`lib/costs/aggregate.ts`:
```ts
import { db } from "@/lib/db";
import { adMetricDaily, ads, llmRuns } from "@/lib/db/schema";
import { eq, and, gte, lte, sum, inArray } from "drizzle-orm";

export async function dailyCosts(campaignId: string, fromDate: string, toDate: string) {
  const adIds = (await db.select({ id: ads.id }).from(ads).where(eq(ads.campaignId, campaignId))).map((a) => a.id);
  const adSpendByDate = await db.select({ date: adMetricDaily.date, total: sum(adMetricDaily.spendCents).as("total") })
    .from(adMetricDaily)
    .where(and(inArray(adMetricDaily.adId, adIds), gte(adMetricDaily.date, fromDate), lte(adMetricDaily.date, toDate)))
    .groupBy(adMetricDaily.date);
  const llmCostByDate = await db.select({ date: llmRuns.date, total: sum(llmRuns.costCents).as("total") })
    .from(llmRuns)
    .where(and(eq(llmRuns.campaignId, campaignId), gte(llmRuns.date, fromDate), lte(llmRuns.date, toDate)))
    .groupBy(llmRuns.date);
  // merge by date
  return mergeByDate(adSpendByDate, llmCostByDate);
}

function mergeByDate(a: any[], b: any[]) {
  const map = new Map<string, { adSpendCents: number; llmCostCents: number }>();
  for (const r of a) map.set(r.date, { adSpendCents: Number(r.total ?? 0), llmCostCents: 0 });
  for (const r of b) {
    const cur = map.get(r.date) ?? { adSpendCents: 0, llmCostCents: 0 };
    cur.llmCostCents = Number(r.total ?? 0);
    map.set(r.date, cur);
  }
  return [...map.entries()].map(([date, v]) => ({ date, ...v })).sort((x, y) => x.date.localeCompare(y.date));
}
```

Tests with seeded rows.

Commit `cost aggregator`.

---

### Task 2: Spend vs streams chart

`components/charts/spend-streams-chart.tsx`:
```tsx
"use client";
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from "recharts";

export type Point = { date: string; spendUsd: number; streams: number | null; baseline: number };

export function SpendStreamsChart({ data }: { data: Point[] }) {
  return (
    <div style={{ width: "100%", height: 320 }}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 16, right: 24, left: 0, bottom: 0 }}>
          <XAxis dataKey="date" />
          <YAxis yAxisId="left" />
          <YAxis yAxisId="right" orientation="right" />
          <Tooltip />
          <Legend />
          <Line yAxisId="left" dataKey="spendUsd" name="Spend ($)" stroke="#000" dot={false} />
          <Line yAxisId="right" dataKey="streams" name="Streams" stroke="#1db954" dot={false} />
          <Line yAxisId="right" dataKey="baseline" name="Baseline" stroke="#999" strokeDasharray="4 4" dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
```

Server-side data builder in `lib/metrics/timeseries.ts` queries `ad_metric_daily` + `release_metric_daily` and returns points. Tests assert the shape and that nulls are preserved.

Commit `spend vs streams chart`.

---

### Task 3: Composite + audience-budget charts

- `composite-chart.tsx` — per-ad time series of `composite_score`, colored by audience. Lines limited to top 10 ads to avoid soup.
- `audience-budget-chart.tsx` — stacked area of daily `audiences.dailyBudgetCents` over time (requires writing a `audience_budget_daily` snapshot — add to the bandit step in Plan 5, but if missed, fall back to current state only).

If `audience_budget_daily` doesn't exist yet, add it now via a small migration + write rows from the bandit step (insert into a `lib/bandit/audience-budget.ts` post-write hook).

Commit `composite + audience charts`.

**Deferred** — audience-budget chart requires an `audience_budget_daily` snapshot table written each day by the bandit step's reweight loop. Add as a follow-up before that snapshot exists; the composite chart is sufficient for v1.

---

### Task 4: Rich ad table

`components/ad-table.tsx`:
- Columns: gen, status, headline, audience, spend, impressions, FB clicks, smartlink clicks, streams, composite, parent, created
- Sortable by composite (default desc)
- Status pill with color
- Click row → ad-detail modal or page showing copy, asset, all-time metrics, lineage tree

Commit `rich ad table`.

---

### Task 5: Audit log viewer

`/campaigns/[id]/audit/page.tsx` — paginated audit-log listing for the campaign. Filter by event kind. Useful for "why did Faye do that?".

Commit `audit viewer`.

---

### Task 6: Costs page

`/campaigns/[id]/costs/page.tsx`:
- Total ad spend (sum of `ad_metric_daily.spendCents`)
- Total LLM cost (sum of `llm_runs.costCents`)
- Daily breakdown chart (stacked bar: ad spend vs LLM cost)
- Per-pass LLM cost split (critique / generate / safety)
- Cost-per-stream (total spend / total streams over campaign window) — flagged as estimate when degraded

Commit `costs page`.

---

### Task 7: Degraded-data banner

`components/degraded-banner.tsx` displays at top of campaign pages whenever today's `release_metric_daily.source === "web_estimate"` OR any `ad_metric_daily.excludedReason` exists in significant proportion. Drives operator awareness.

Commit `degraded banner`.

---

### Task 8: FB ad-disapproval webhook

`app/api/fb/webhook/route.ts`:
```ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ads } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { writeAudit } from "@/lib/audit/log";
import { env } from "@/lib/env";
import { createHmac, timingSafeEqual } from "node:crypto";

export async function GET(req: Request) {
  // verification challenge from Meta
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  if (mode === "subscribe" && token === env().FB_WEBHOOK_VERIFY_TOKEN) {
    return new NextResponse(challenge ?? "", { status: 200 });
  }
  return NextResponse.json({ error: "bad verify" }, { status: 403 });
}

export async function POST(req: Request) {
  const raw = await req.text();
  const sig = req.headers.get("x-hub-signature-256");
  if (!sig || !verifyFbSignature(raw, sig, env().FB_WEBHOOK_APP_SECRET)) {
    return NextResponse.json({ error: "bad signature" }, { status: 401 });
  }
  const body = JSON.parse(raw);
  // body.entry[].changes[] contain ad updates; on disapproval, fb_ad_id maps to ad in DB
  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field === "ads_review" && change.value?.review_status === "disapproved") {
        const fbAdId = change.value.ad_id;
        const reason = change.value.disapproval_reason ?? "policy";
        await db.update(ads).set({ status: "rejected", rejectedAt: new Date(), rejectedReason: reason }).where(eq(ads.fbAdId, fbAdId));
        await writeAudit({ entityType: "ad", entityId: fbAdId, event: "fb_disapproved", payload: { reason } });
      }
    }
  }
  return NextResponse.json({ ok: true });
}

function verifyFbSignature(raw: string, header: string, secret: string): boolean {
  const expected = "sha256=" + createHmac("sha256", secret).update(raw).digest("hex");
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
```

Add `FB_WEBHOOK_VERIFY_TOKEN` + `FB_WEBHOOK_APP_SECRET` to env schema + `.env.example`. Tests cover verify challenge + signed POST.

Update middleware `PUBLIC_PATHS` to include `/api/fb/webhook`.

Commit `fb disapproval webhook`.

---

### Task 9: Nightly backup script

`deploy/backup.sh`:
```bash
#!/usr/bin/env bash
set -euo pipefail
TS=$(date -u +"%Y%m%dT%H%M%SZ")
OUT="/tmp/faye-${TS}.sql.gz"
pg_dump faye_prod | gzip > "$OUT"
b2 upload-file faye-backups "$OUT" "db/${TS}.sql.gz"
rm "$OUT"
```

Crontab entry:
```
0 5 * * * /opt/faye/deploy/backup.sh >> /var/log/faye/backup.log 2>&1
```

Also tar+upload `/opt/faye/uploads/` weekly.

README updated with restore drill instructions.

Commit `nightly backup`.

---

### Task 10: Error pages + loading states + polish

- `app/error.tsx` and `app/not-found.tsx` for global error/404
- `loading.tsx` files in each `[id]` segment so navigation has skeletons
- Cache campaign queries with React.cache where appropriate
- Lighthouse pass: ensure Tailwind purging works (it does), images use `<Image>` for assets when possible

Commit `error pages + loading states`.

---

### Task 11: Final integration test

Add `tests/integration.test.ts` that drives the happy path end-to-end against the test DB:
1. Sign in (synthetic session)
2. Create artist
3. Upload asset
4. Create release
5. Create audience seed
6. Create campaign (mocked FB + Smartlink)
7. Stub LLM client to return a deterministic generate output
8. Run `runDailyLoop`
9. Advance time, run `publisherTick`
10. Assert one ad ends up `published` with a `fb_ad_id`
11. Mint a reject token for another pending ad → run `rejectAction` → assert `rejected`

Commit `final integration test`.

---

## Done

After Task 11:
- Operator has full visibility: spend, streams, composite, audience budget, cost per stream
- Audit log viewable per campaign
- FB disapproval flows back into DB automatically
- Nightly backups running
- Error/loading states polished
- One end-to-end test proves the full pipeline works against mocks

---

## What's next (post Plan 8)

- Submit Meta Marketing API Advanced Access (out-of-band; should already be in flight from Plan 3)
- Apply to Spotify for Artists partner program
- First real-money pilot with a single artist + tight budget cap
- Iterate on composite weights + bandit K/N based on real data
- (Phase 9 candidate: multi-tenant, public signup, billing — only if you want to productize)
