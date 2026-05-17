# Faye Plan 4 — Campaign Creation + Manual Publishing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Operator can create a release campaign (artist + release + smartlink + budget + window + audiences), hand-write one ad's copy, and publish it through the FB Marketing API. No bandit / LLM yet — fully manual orchestration that ends with a live ad delivering against a real ad set.

**Architecture:** Two new domain folders (`lib/campaigns`, `lib/ads`), wiring FB client + Smartlink client from Plan 3. Smartlink is created at campaign-create. The full chain `campaign → ad_set (per audience) → ad` mirrors FB's hierarchy. `ad.status` transitions: `draft → pending → published`. Manual publish bypasses the `publish_at` delay (defer-then-publish lands in Plan 7).

**Tech Stack:** Inherited TS / Next.js / Drizzle / Vitest / FB SDK / Feature.fm client.

**Spec:** `docs/superpowers/specs/2026-05-16-faye-design.md` §4 architecture (campaign), §5 data model (campaign / audience / ad), §6 step 7 (publisher tick semantics — partially used here).

---

## File Structure

```
faye/
  lib/db/schema.ts                # MODIFY: add campaigns, audiences, ads, audit_log
  drizzle/0003_*.sql

  lib/
    campaigns/
      queries.ts
      mutations.ts                # createCampaign (also creates smartlink + FB campaign skeleton)
      lifecycle.ts                # pause/resume/end
    audiences/
      live.ts                     # createLiveAudience (from seed + campaign) → fb_adset
    ads/
      queries.ts
      mutations.ts                # createDraftAd, publishAd, pauseAd, killAd
    audit/
      log.ts                      # writeAudit(event, payload)

  app/
    campaigns/
      page.tsx                    # list
      [id]/
        page.tsx                  # campaign detail (audiences, ads, status)
        ads/
          page.tsx                # ad list
          new/page.tsx            # manual ad copy form
          actions.ts
        actions.ts                # pause/resume/end campaign
    artists/[id]/campaigns/
      new/page.tsx                # create campaign for this artist
      actions.ts

  components/
    forms/
      campaign-form.tsx
      ad-form.tsx                 # hand-write headline/primary text/body + asset picker
    campaigns/
      audience-pickup.tsx         # checkbox grid over audience seeds
      ad-card.tsx

  tests/
    campaigns.test.ts
    ads.test.ts
    audit.test.ts
```

---

### Task 1: Schema additions

**Files:** modify `lib/db/schema.ts`; new migration `drizzle/0003_*.sql`; modify `tests/setup.ts`.

- [ ] **Step 1: Append**

```ts
export const campaigns = pgTable("campaigns", {
  id: uuid("id").defaultRandom().primaryKey(),
  artistId: uuid("artist_id").notNull().references(() => artists.id, { onDelete: "cascade" }),
  releaseId: uuid("release_id").notNull().references(() => releases.id, { onDelete: "cascade" }),
  smartlinkId: text("smartlink_id"),
  smartlinkUrl: text("smartlink_url"),
  dailyBudgetCents: integer("daily_budget_cents").notNull(),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  status: text("status", { enum: ["draft", "active", "paused", "ended"] }).notNull().default("draft"),
  fbCampaignId: text("fb_campaign_id"),
  timezone: text("timezone").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const audiences = pgTable("audiences", {
  id: uuid("id").defaultRandom().primaryKey(),
  campaignId: uuid("campaign_id").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
  seedId: uuid("seed_id").references(() => audienceSeeds.id),
  name: text("name").notNull(),
  fbTargetingSpec: jsonb("fb_targeting_spec").notNull(),
  fbAdSetId: text("fb_ad_set_id"),
  dailyBudgetCents: integer("daily_budget_cents").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const ads = pgTable("ads", {
  id: uuid("id").defaultRandom().primaryKey(),
  campaignId: uuid("campaign_id").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
  audienceId: uuid("audience_id").notNull().references(() => audiences.id, { onDelete: "cascade" }),
  assetId: uuid("asset_id").notNull().references(() => assets.id),
  generation: integer("generation").notNull().default(0),
  copyHeadline: text("copy_headline").notNull(),
  copyBody: text("copy_body").notNull(),
  copyPrimaryText: text("copy_primary_text").notNull(),
  fbAdId: text("fb_ad_id"),
  status: text("status", { enum: ["draft", "pending", "published", "rejected", "paused", "killed"] }).notNull().default("draft"),
  publishAt: timestamp("publish_at", { withTimezone: true }),
  rejectedAt: timestamp("rejected_at", { withTimezone: true }),
  rejectedReason: text("rejected_reason"),
  parentAdId: uuid("parent_ad_id").references(() => ads.id),
  promptHash: text("prompt_hash"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const auditLog = pgTable("audit_log", {
  id: uuid("id").defaultRandom().primaryKey(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  event: text("event").notNull(),
  payload: jsonb("payload"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Campaign = typeof campaigns.$inferSelect;
export type Audience = typeof audiences.$inferSelect;
export type Ad = typeof ads.$inferSelect;
```

- [ ] **Step 2: Generate + migrate + update truncate**

`pnpm db:generate && pnpm db:migrate`. Add the new tables to `tests/setup.ts` TRUNCATE (order matters: `audit_log, ads, audiences, campaigns,` ... before the existing ones).

- [ ] **Step 3: Commit**

```bash
git add lib/db/schema.ts drizzle/ tests/setup.ts
git commit -m "schema: campaigns, audiences, ads, audit_log"
```

---

### Task 2: Audit log helper

**Files:** `lib/audit/log.ts`, `tests/audit.test.ts`.

```ts
// lib/audit/log.ts
import { db } from "@/lib/db";
import { auditLog } from "@/lib/db/schema";

export async function writeAudit(args: {
  entityType: string;
  entityId: string;
  event: string;
  payload?: unknown;
}): Promise<void> {
  await db.insert(auditLog).values({
    entityType: args.entityType,
    entityId: args.entityId,
    event: args.event,
    payload: args.payload ?? null,
  });
}
```

Test: insert + select returns row.

Commit: `audit log helper`.

---

### Task 3: Campaign mutations (create, lifecycle)

**Files:** `lib/campaigns/queries.ts`, `lib/campaigns/mutations.ts`, `lib/campaigns/lifecycle.ts`, `tests/campaigns.test.ts`.

`createCampaign` performs (in order, fail-fast on any step):
1. Insert `campaign` row with status `draft`
2. Create FB campaign via `FBClient.createCampaign` → store `fbCampaignId`
3. Create smartlink via `SmartlinkClient.create` (uses artist name + release title + Spotify URL from release.spotifyId) → store `smartlinkId` + `smartlinkUrl`
4. For each picked audience seed, copy spec to a new `audiences` row + create FB ad set with the campaign's `dailyBudgetCents / pickedSeedCount` initial split
5. Flip campaign status to `active`
6. Write audit entries for each step

If any step fails: status stays `draft`, partial FB objects can be cleaned up manually. Don't auto-rollback (FB IDs are persistent).

```ts
// lib/campaigns/mutations.ts (key bits)
import { db } from "@/lib/db";
import { campaigns, audiences } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { writeAudit } from "@/lib/audit/log";
import { makeFBClient } from "@/lib/fb/factory";
import { makeSmartlinkClient } from "@/lib/smartlink/factory";
import { getSecret } from "@/lib/secrets/queries";
import { getArtist } from "@/lib/artists/queries";
import { getRelease } from "@/lib/releases/queries";
import { getAudienceSeed } from "@/lib/audiences/queries";

export type CreateCampaignInput = {
  artistId: string;
  releaseId: string;
  dailyBudgetCents: number;
  startDate: string;          // YYYY-MM-DD
  endDate: string;
  audienceSeedIds: string[];
  spotifyTrackOrAlbumUrl: string;
};

export async function createCampaign(input: CreateCampaignInput) {
  if (input.audienceSeedIds.length === 0 || input.audienceSeedIds.length > 5) {
    throw new Error("must pick 1–5 audience seeds");
  }
  const artist = await getArtist(input.artistId);
  const release = await getRelease(input.releaseId);
  if (!artist || !release) throw new Error("artist or release not found");

  const [campaign] = await db.insert(campaigns).values({
    artistId: input.artistId,
    releaseId: input.releaseId,
    dailyBudgetCents: input.dailyBudgetCents,
    startDate: input.startDate,
    endDate: input.endDate,
    timezone: artist.timezone,
    status: "draft",
  }).returning();

  const fb = await makeFBClient();
  const sl = await makeSmartlinkClient();
  const adAccountId = await getSecret("fb.ad_account_id");
  if (!adAccountId) throw new Error("missing secret fb.ad_account_id");

  const fbCamp = await fb.createCampaign({
    adAccountId,
    name: `${artist.name} — ${release.title}`,
    objective: "OUTCOME_TRAFFIC",
    status: "PAUSED",
  });
  await db.update(campaigns).set({ fbCampaignId: fbCamp.id }).where(eq(campaigns.id, campaign.id));
  await writeAudit({ entityType: "campaign", entityId: campaign.id, event: "fb_campaign_created", payload: { fbCampaignId: fbCamp.id } });

  const smartlink = await sl.create({
    artistName: artist.name,
    releaseTitle: release.title,
    spotifyTrackOrAlbumUrl: input.spotifyTrackOrAlbumUrl,
  });
  await db.update(campaigns).set({ smartlinkId: smartlink.id, smartlinkUrl: smartlink.shortUrl }).where(eq(campaigns.id, campaign.id));
  await writeAudit({ entityType: "campaign", entityId: campaign.id, event: "smartlink_created", payload: { id: smartlink.id, url: smartlink.shortUrl } });

  const perAudienceBudget = Math.floor(input.dailyBudgetCents / input.audienceSeedIds.length);
  for (const seedId of input.audienceSeedIds) {
    const seed = await getAudienceSeed(seedId);
    if (!seed || seed.artistId !== input.artistId) throw new Error(`bad seed ${seedId}`);
    const fbAdSet = await fb.createAdSet({
      campaignId: fbCamp.id,
      name: seed.name,
      dailyBudgetCents: perAudienceBudget,
      targetingSpec: seed.targetingSpec,
      optimization: "LINK_CLICKS",
      startTime: new Date(`${input.startDate}T00:00:00Z`),
      endTime: new Date(`${input.endDate}T00:00:00Z`),
      status: "PAUSED",
    });
    await db.insert(audiences).values({
      campaignId: campaign.id,
      seedId,
      name: seed.name,
      fbTargetingSpec: seed.targetingSpec as any,
      fbAdSetId: fbAdSet.id,
      dailyBudgetCents: perAudienceBudget,
    });
    await writeAudit({ entityType: "campaign", entityId: campaign.id, event: "audience_created", payload: { seedId, fbAdSetId: fbAdSet.id } });
  }

  await db.update(campaigns).set({ status: "active" }).where(eq(campaigns.id, campaign.id));
  await writeAudit({ entityType: "campaign", entityId: campaign.id, event: "activated" });

  return await db.select().from(campaigns).where(eq(campaigns.id, campaign.id)).then((r) => r[0]);
}
```

Lifecycle (`lib/campaigns/lifecycle.ts`): `pauseCampaign(id)`, `resumeCampaign(id)`, `endCampaign(id)`. Each flips status + writes audit + pauses underlying FB ad sets via `FBClient`.

Tests use mock FB + mock Smartlink clients — verify ordering, audit entries, and that audience rows + FB ad set IDs are created. Inject mocks via constructor-style override on the factories or by stubbing `getSecret` to return mock values.

Commit: `campaign mutations + lifecycle`.

---

### Task 4: Manual ad creation + publish

**Files:** `lib/ads/queries.ts`, `lib/ads/mutations.ts`, `tests/ads.test.ts`.

```ts
// lib/ads/mutations.ts
import { db } from "@/lib/db";
import { ads, audiences, campaigns, assets } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { writeAudit } from "@/lib/audit/log";
import { makeFBClient } from "@/lib/fb/factory";
import { getSecret } from "@/lib/secrets/queries";

export type CreateDraftAdInput = {
  campaignId: string;
  audienceId: string;
  assetId: string;
  copyHeadline: string;
  copyPrimaryText: string;
  copyBody: string;
};

export async function createDraftAd(input: CreateDraftAdInput) {
  const [row] = await db.insert(ads).values({ ...input, status: "draft", generation: 0 }).returning();
  await writeAudit({ entityType: "ad", entityId: row.id, event: "draft_created" });
  return row;
}

export async function publishAd(adId: string) {
  const [ad] = await db.select().from(ads).where(eq(ads.id, adId)).limit(1);
  if (!ad) throw new Error("ad not found");
  if (ad.status !== "draft" && ad.status !== "pending") throw new Error(`cannot publish ad in status ${ad.status}`);
  const [audience] = await db.select().from(audiences).where(eq(audiences.id, ad.audienceId)).limit(1);
  const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, ad.campaignId)).limit(1);
  const [asset] = await db.select().from(assets).where(eq(assets.id, ad.assetId)).limit(1);
  if (!audience?.fbAdSetId) throw new Error("audience has no FB ad set");

  const fb = await makeFBClient();
  const pageId = await getSecret("fb.page_id");
  if (!pageId) throw new Error("missing fb.page_id");

  const creative = await fb.createAdCreative({
    pageId,
    headline: ad.copyHeadline,
    primaryText: ad.copyPrimaryText,
    body: ad.copyBody,
    imageUrl: absoluteAssetUrl(asset.url),
    landingUrl: campaign.smartlinkUrl!,
  });
  const fbAd = await fb.createAd({
    adSetId: audience.fbAdSetId,
    creativeId: creative.id,
    name: `gen${ad.generation} ${ad.copyHeadline.slice(0, 40)}`,
    status: "ACTIVE",
  });
  await db.update(ads).set({ fbAdId: fbAd.id, status: "published" }).where(eq(ads.id, adId));
  await writeAudit({ entityType: "ad", entityId: adId, event: "published", payload: { fbAdId: fbAd.id } });
}

export async function pauseAdById(adId: string) { /* ... call fb.pauseAd, flip status */ }
export async function killAdById(adId: string)  { /* ... call fb.archiveAd, flip status */ }

function absoluteAssetUrl(relative: string): string {
  const base = process.env.APP_URL ?? "http://localhost:3000";
  return `${base}${relative}`;
}
```

Tests cover (a) draft create, (b) publish flow calls FB.createAdCreative + createAd in correct order with correct args (use the mock FB client + assert on its recorded calls), (c) status transitions valid, (d) status transitions invalid (cannot publish published ad).

Commit: `manual ad create + publish`.

---

### Task 5: Campaign create UI

**Files:**
- `app/artists/[id]/campaigns/new/page.tsx`
- `app/artists/[id]/campaigns/actions.ts`
- `components/forms/campaign-form.tsx`
- `components/campaigns/audience-pickup.tsx`

Form fields:
- Release (select from artist's releases)
- Spotify URL (auto-derived from release.spotifyId but editable in case the release is a multi-track album where you want to deep-link)
- Daily budget (USD, will be stored * 100 as cents)
- Start date / end date
- Audience seeds (checkbox list of artist's audience seeds, 1–5 required)

Server action calls `createCampaign(...)` → redirect to `/campaigns/[id]`.

Commit: `campaign create ui`.

---

### Task 6: Campaign list + detail + audience view

**Files:** `app/campaigns/page.tsx`, `app/campaigns/[id]/page.tsx`, `components/campaigns/ad-card.tsx`.

List shows: name (artist — release), status, start–end, daily budget, today's spend (placeholder until Plan 8). Detail shows audiences w/ FB ad-set ID + budget, ads grouped by audience, pause/resume/end controls.

Commit: `campaign list + detail`.

---

### Task 7: Manual ad form + ad pages

**Files:** `app/campaigns/[id]/ads/{page,actions}.tsx`, `app/campaigns/[id]/ads/new/page.tsx`, `components/forms/ad-form.tsx`.

Ad form fields: audience (select), asset (grid picker), headline (40 char max), primary text (125 char target), body. Submit posts `createDraftAdAction → publishAdAction` (one click both creates + publishes). Add a separate "Save as draft" button that stops after `createDraftAd`.

Visual smoke: with mock factories returning `fb_ad_xxx`, the flow should land you on the campaign detail page with the new ad showing as `published`.

Commit: `manual ad ui`.

---

### Task 8: Lifecycle controls + audit log viewer

**Files:** `app/campaigns/[id]/actions.ts` (pause/resume/end campaign), and a minimal `/campaigns/[id]/audit/page.tsx` reading recent audit events for the campaign.

Commit: `campaign lifecycle + audit viewer`.

---

## Done

After Task 8:
- Operator can create a campaign end-to-end through the UI: pick release, budget, audiences → smartlink + FB campaign + FB ad sets created
- Operator can hand-write an ad and click "Publish" → ad goes live in FB
- Pause / resume / end controls work
- Audit log records every meaningful action
- Tests cover happy paths + key failure modes against mocked external clients

**Next plan:** Plan 5 — Composite scoring + bandit + publisher tick.
