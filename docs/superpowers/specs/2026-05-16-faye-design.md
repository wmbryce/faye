# Faye — design

Autonomous agent: places Facebook ads to drive Spotify listens for a given artist + release, learns daily from results.

**Date:** 2026-05-16
**Owner:** Michael Bryce
**Status:** design approved, pending plan

---

## 1. Goal

Given (artist, release, smart-link, daily budget, window), Faye runs a self-improving daily loop of FB ads optimised to maximise a composite score weighted toward cheap, high-converting clicks to Spotify.

Success: Faye gets measurably better day-over-day at writing + buying FB ads for a given artist within a given campaign window.

---

## 2. Inputs

Per artist (one-time setup):
- name, Spotify artist ID, timezone, FB page ID
- voice guide (free-text used in LLM prompt)
- asset pool (images/short video, uploaded once)
- default audience seeds (FB targeting specs — interests, lookalikes, geo, age)
- (optional) Spotify-for-Artists OAuth token

Per release campaign:
- release (track or album), Spotify ID
- smart link URL (Feature.fm, created at campaign create)
- start_date, end_date
- daily budget (USD cents)
- audiences to use (subset of artist's seeds; ≤ 5 active per campaign)

---

## 3. Optimization target

Composite per ad per day, weights fixed at v1:

```
score = 0.6 · norm(-CPC)
      + 0.2 · norm(stream_credit_ad)
      + 0.2 · norm(stream_per_click_ad)
```

- `norm` = rank-normalised within campaign-day cohort (robust to outliers)
- `stream_credit_ad = release_stream_delta_vs_baseline × ad_smartlink_clicks / Σ smartlink_clicks`
- `stream_per_click_ad = smartlink_streams / smartlink_clicks` (fallback: apportioned_streams / fb_link_clicks)
- Ads with < 500 impressions excluded from ranking, marked `exploring`, kept alive
- If Spotify-for-Artists data unavailable: drop stream-delta weight, redistribute 0.6/0.4 between CPC/stream-per-click; flag run as degraded
- If smartlink stream conversions also unavailable: composite = `norm(-CPC)` only; flag run as severely degraded

---

## 4. Architecture

Single TS monorepo. Next.js (App Router) as unified web surface — pages + API routes. Cron jobs are separate Node entries invoked via `tsx`, importing from shared `lib/`.

```
faye/
  app/                  # Next.js pages + API routes
  lib/
    db/                 # Drizzle schema + queries
    fb/                 # FB Marketing API client
    smartlink/          # Feature.fm client
    spotify/            # Web API + S4A clients (S4A optional)
    llm/                # OpenRouter client, prompt builders, caching
    email/              # Resend client + digest templates
    bandit/             # ranking, pruning, audience-budget reweighting
    composite/          # score computation
    safety/             # ad-policy classifier
  scripts/
    daily.ts            # per-artist-TZ daily loop
    publish-tick.ts     # every-5-min publisher
  drizzle/              # migrations
```

**Runtime surfaces (all share lib/):**

1. `next start` under systemd — web UI + API + webhook receivers (FB ad-disapproval)
2. `tsx scripts/daily.ts` via system cron, per artist timezone at 09:00 local
3. `tsx scripts/publish-tick.ts` via system cron, every 5 min

**Hosting:** Hetzner CX22. Postgres on same box. Caddy front for auto-TLS. Pino → systemd journal. `pg_dump` nightly → Backblaze B2. No Sentry at v1.

**Auth:** magic link via Resend → DB-backed signed session cookie. Single user.

**Secrets:** `.env` on VPS (mode 600). Optional sops-encrypted `.env.sops` in repo for DR.

---

## 5. Data model

Money in cents. All timestamps UTC; "campaign day" = artist's local day, converted on read.

- **`artist`** — id, name, spotify_artist_id, timezone, fb_page_id, voice_guide, default_audience_seeds (jsonb), spotify_for_artists_token (nullable), notes
- **`asset`** — id, artist_id, type (image|video), url, label
- **`release`** — id, artist_id, kind (track|album), spotify_id, title, release_date
- **`campaign`** — id, artist_id, release_id, smartlink_id, smartlink_url, daily_budget_cents, start_date, end_date, status (draft|active|paused|ended), fb_campaign_id, timezone
- **`audience`** — id, campaign_id, name, fb_targeting_spec (jsonb), fb_adset_id, daily_budget_cents (Faye-computed), active
- **`ad`** — id, campaign_id, audience_id, asset_id, generation (int), copy_headline, copy_body, copy_primary_text, fb_ad_id, status (pending|published|rejected|paused|killed), publish_at, rejected_at, rejected_reason, parent_ad_id (lineage), prompt_hash
- **`ad_metric_daily`** — ad_id, date, spend_cents, impressions, fb_link_clicks, smartlink_clicks, smartlink_streams (nullable), composite_score, excluded_reason (nullable: e.g. `low_impressions`, `fraud_suspected`)
- **`release_metric_daily`** — release_id, date, spotify_streams (nullable), spotify_listeners (nullable), source (s4a|fallback)
- **`llm_run`** — id, campaign_id, date, kind (critique|generate|safety), model, input_tokens, output_tokens, cached_input_tokens, cost_cents, prompt_hash, output (jsonb)
- **`notification`** — id, campaign_id, kind, sent_at, payload
- **`audit_log`** — id, entity_type, entity_id, event, payload, created_at
- **`user`** + **`session`** — single operator

**Invariants:**
- ad ↔ exactly one (campaign, audience, asset, generation)
- composite_score computed per ad per day after metrics pulled
- generation increments per campaign per daily-loop run
- parent_ad_id tracks LLM-variant lineage

---

## 6. Daily loop (per campaign, 09:00 artist-local)

1. **Pull yesterday's data** — FB insights, Feature.fm clicks + (optional) stream conversions, Spotify per-track stream delta
2. **Compute composite score** — see §3; write `ad_metric_daily` rows
3. **Fraud filter** — drop ads with CTR > 10% AND CPC < $0.05 AND zero stream conversions from ranking; mark `excluded_reason='fraud_suspected'`
4. **Bandit prune** (per audience) — keep top K=3 published ads alive; pause the rest (status=`paused`). Every 3 generations, archive (status=`killed`) anything paused 3+ gens to stay under FB's ad-set ad-count cap
5. **LLM critique pass** — Opus 4.7 via OpenRouter. Input: top-K + recently-killed ad copies + their metrics + artist voice guide. Output: 2-3 bullets on winning theme + what's tired. Cached prefix = artist context block.
6. **LLM generate pass** — Sonnet 4.6. Input: critique + voice guide + audience descriptions. Output: N=5 new variants per audience as structured JSON (headline, primary_text, body, asset_match_hint).
7. **LLM safety pass** — Haiku 4.5. Per variant, classify against Meta ad policy heuristics. Drop violators; log in `llm_run`.
8. **Asset selection** — round-robin across artist's asset pool unless `asset_match_hint` matches a labeled asset
9. **Stage** — insert `ad` rows: status=`pending`, publish_at = now + 30min, parent_ad_id pointing to closest-theme survivor
10. **Audience-budget reweighting** — multiplicative weights (EXP3-style) on audience composite means: shift daily_budget_cents toward higher-scoring audiences, capped ±20% per day; update each `audience.daily_budget_cents`
11. **Email digest** — Resend HTML digest: pending ads (copy + asset thumb), per-ad signed reject link (JWT, 24h TTL, single-use), prior-day metrics summary, degraded-data flag if applicable
12. **Audit log** — record every action

**Cold start (gens 0-3):** exploration mode. Don't prune except obvious losers (zero clicks after 1000 impressions). Gen 0 has no prior data — generate from artist seed brief only. Gen 4+: full loop.

**Publisher tick (every 5 min):**
- Find `pending AND publish_at ≤ now AND not rejected`
- Create in FB via Marketing API (one AdCreative + one Ad per row, attached to the right ad set)
- On success: store `fb_ad_id`, status → `published`
- On FB rejection: status → `rejected`, log reason
- Refresh insights for `published` ads (cached 30 min)

**Stop conditions:**
- `end_date` reached → status `ended`, pause all ads
- Composite score declining for ≥ 3 consecutive days → email warning, no auto-pause
- FB ad-disapproval webhook fires → mark that ad `rejected`, log

---

## 7. Integrations

- **FB Marketing API** — `facebook-nodejs-business-sdk`. Requires Advanced Access app review (start Day 1). Webhook subscribed to ad-disapprovals. Backoff on 429.
- **Feature.fm** — Smartlink + analytics via their API. One smartlink per campaign. Abstract behind `SmartlinkClient` interface.
- **Spotify Web API + Spotify for Artists API** — Web API always available (popularity, follower count). S4A optional per artist (OAuth token). Composite auto-degrades without S4A.
- **OpenRouter** — single endpoint, model strings per task in env (`FAYE_MODEL_GENERATE`, `FAYE_MODEL_CRITIQUE`, `FAYE_MODEL_SAFETY`). Defaults all Anthropic: Sonnet 4.6 / Opus 4.7 / Haiku 4.5. Pass-through Anthropic prompt-caching on artist-context prefix.
- **Resend** — email digest + magic-link login. React Email templates.
- **Postgres** — Drizzle ORM, drizzle-kit migrations.

---

## 8. Web UI (Next.js App Router)

- `/login` — magic link
- `/` — campaigns list
- `/campaigns/[id]` — detail: spend/stream chart, ads by generation, composite per ad, audience-budget chart, "kill"/"boost" overrides
- `/campaigns/[id]/review` — today's pending queue, approve/reject
- `/reject/[token]` — signed link landing (confirm + reject)
- `/artists/new`, `/artists/[id]` — setup + edit
- `/artists/[id]/assets` — asset library
- `/campaigns/new` — create campaign per release
- `/settings` — review delay, K/N, weights, model strings, API keys

Tech: Tailwind, shadcn/ui, Recharts.

---

## 9. Defaults (v1)

- K survivors = 3, N new variants = 5 per audience per day
- Min impressions for scoring = 500
- Review delay = 30 min
- Max active audiences/campaign = 5
- Cold-start gens = 0-3
- Audience-budget shift cap = ±20%/day
- Composite weights: 0.6 / 0.2 / 0.2
- Composite normalisation: rank-based
- Reject token TTL = 24h, single-use
- Models: Sonnet 4.6 (generate), Opus 4.7 (critique), Haiku 4.5 (safety) — all via OpenRouter
- Sentry: off
- Approval flow: always confirm in web UI (email link → /reject/[token] → confirm → DB)

---

## 10. Risks

**External access (gates real campaigns):**
- Meta Marketing API Advanced Access review — 1-3 wks, start Day 1
- Spotify for Artists API access — invite-only, may not be granted; fallback required
- Feature.fm API tier — confirm endpoints expose Spotify-stream conversion before commit

**Technical:**
- Stream attribution noise — smartlink stream tracking requires same-browser Spotify session; under-counts streams. Composite leans on CPC in practice.
- Cold-start budget burn — gens 0-3 explore; some spend wasted by design
- TZ drift — FB / Feature.fm / Spotify report on different days; pick artist-local-day as canonical
- FB ad-set ad-count limit — archive (`killed`) old paused ads every 3 generations
- Click fraud — fraud filter (§6 step 3); revisit thresholds after week 1
- Ad account ban — safety pass + disapproval webhook + soft daily cap

**Operational:**
- LLM cost — tracked per `llm_run`; prompt-cache the artist block; daily LLM cost shown in dashboard
- Backups — `pg_dump` nightly → B2; weekly restore drill week 1

---

## 11. Out of scope (v1)

- Multi-tenant / public signup
- Image / video generation
- Goal-driven planning ("hit X listeners by Y")
- A/B test of landing page (smartlink vs direct Spotify URL)
- Multi-platform ads (TikTok, IG-only modes, YouTube)
- Mobile app

---

## 12. Unresolved questions

- Feature.fm tier — confirm analytics endpoints expose Spotify stream conversion metric
- S4A partner-program eligibility — apply, see what happens
- exact FB ad-set ad-count cap — confirm against current docs; tune archive cadence
- composite-score weights — locked at 0.6/0.2/0.2 for v1, revisit after first 4 weeks of real data
- which Feature.fm event = "stream"? click-then-Spotify-tab-open vs verified-play — clarify with their docs
- TZ edge case: artists in TZ where 09:00 local crosses UTC date boundary — confirm cron semantics handle DST + day-line correctly
- VPS sizing past N concurrent campaigns — CX22 fine for low single digits; revisit at scale
- LLM cost cap per campaign per month — none in v1, add later if it gets out of hand
- Asset rotation when LLM `asset_match_hint` doesn't match any label — fall back to round-robin (current spec) or pick highest-historical-score asset (alternative)?
