# Faye Plan 7 — Email Digest + Approve/Reject Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After Plan 6 stages each day's new ads as `pending`, Faye emails the operator a digest of what's about to go live + yesterday's results. Each pending ad has a signed reject link (24h TTL, single-use) → web confirm page. Publisher tick (Plan 5) skips any ad in status `rejected`.

**Architecture:** A new digest sender invoked at end of `runDailyLoop` builds a per-campaign email with React Email components. Reject tokens use the HMAC token util (Plan 1) plus a new `consumed_reject_tokens` table to enforce single-use. The reject-confirm page lives at `/reject/[token]` and calls a server action that updates the ad + records consumption.

**Tech Stack:** Inherited + Plan 5 React Email templates.

**Spec:** `docs/superpowers/specs/2026-05-16-faye-design.md` §6 step 11, §8 reject route, §9 reject token TTL+single-use.

---

## File Structure

```
faye/
  lib/db/schema.ts                # MODIFY: add consumed_reject_tokens, notifications
  drizzle/0006_*.sql

  lib/
    email/
      digest/
        builder.ts                # build digest data (per-campaign yesterday metrics + pending ads)
        template.tsx              # React Email layout
        send.ts                   # send via Resend with operator's email
      reject-tokens.ts            # sign + verify single-use reject tokens
    notifications/
      log.ts                      # write notification row

  app/
    reject/
      [token]/
        page.tsx                  # GET: show ad + reject button
        actions.ts                # POST: confirm reject

  scripts/
    digest.ts                     # `tsx scripts/digest.ts --all` (called after daily.ts)

  tests/
    reject-tokens.test.ts
    digest-builder.test.ts
    reject-flow.test.ts
```

---

### Task 1: Schema

```ts
export const consumedRejectTokens = pgTable("consumed_reject_tokens", {
  nonce: text("nonce").primaryKey(),                // taken from token payload
  adId: uuid("ad_id").notNull().references(() => ads.id, { onDelete: "cascade" }),
  consumedAt: timestamp("consumed_at", { withTimezone: true }).defaultNow().notNull(),
});

export const notifications = pgTable("notifications", {
  id: uuid("id").defaultRandom().primaryKey(),
  campaignId: uuid("campaign_id").references(() => campaigns.id, { onDelete: "set null" }),
  kind: text("kind").notNull(),                     // "daily_digest"
  sentAt: timestamp("sent_at", { withTimezone: true }).defaultNow().notNull(),
  payload: jsonb("payload"),                        // for debugging
});
```

Migrate + update truncate. Commit `schema: reject tokens + notifications`.

---

### Task 2: Reject tokens

`lib/email/reject-tokens.ts`:
```ts
import { signToken, verifyToken } from "@/lib/auth/tokens";
import { env } from "@/lib/env";
import { db } from "@/lib/db";
import { consumedRejectTokens } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const REJECT_TTL_MS = 24 * 60 * 60 * 1000;

export type RejectPayload = { adId: string };

export async function makeRejectToken(adId: string): Promise<string> {
  return signToken({
    payload: { adId, kind: "reject" } as any,
    ttlMs: REJECT_TTL_MS,
    secret: env().AUTH_TOKEN_SECRET,
  });
}

export type RejectVerify =
  | { ok: true; adId: string; nonce: string }
  | { ok: false; reason: "malformed" | "bad_signature" | "expired" | "already_used" };

export async function verifyRejectToken(token: string): Promise<RejectVerify> {
  const v = await verifyToken<{ adId: string; kind: string }>({ token, secret: env().AUTH_TOKEN_SECRET });
  if (!v.ok) return { ok: false, reason: v.reason };
  if (v.payload.kind !== "reject") return { ok: false, reason: "malformed" };
  const [used] = await db.select().from(consumedRejectTokens).where(eq(consumedRejectTokens.nonce, v.payload.nonce)).limit(1);
  if (used) return { ok: false, reason: "already_used" };
  return { ok: true, adId: v.payload.adId, nonce: v.payload.nonce };
}

export async function consumeRejectToken(args: { nonce: string; adId: string }): Promise<void> {
  await db.insert(consumedRejectTokens).values(args);
}
```

Tests:
- Roundtrip + verify
- Expired (set ttl=-1)
- Reuse — consume once, then verify → `already_used`
- Tampered

Commit `reject tokens`.

---

### Task 3: Digest builder

`lib/email/digest/builder.ts` aggregates the data:

```ts
export type CampaignDigest = {
  campaignId: string;
  campaignName: string;            // "Artist — Release"
  yesterday: {
    spendCents: number;
    impressions: number;
    fbLinkClicks: number;
    smartlinkClicks: number;
    smartlinkStreams: number | null;
    spotifyStreams: number | null;
    spotifyStreamDelta: number | null;
    composite: number | null;       // mean across all ads
    degraded: boolean;               // true if S4A unavailable
  };
  pendingAds: {
    adId: string;
    audienceName: string;
    assetUrl: string;
    copyHeadline: string;
    copyPrimaryText: string;
    rejectUrl: string;               // built from makeRejectToken
    publishAt: Date;
  }[];
};

export async function buildCampaignDigest(campaignId: string, date: string): Promise<CampaignDigest> { /* ... */ }
```

Unit test with seeded DB rows: assert correct aggregation, correct reject URL format (`<APP_URL>/reject/<token>`), correct degraded flag.

Commit `digest builder`.

---

### Task 4: Digest template + sender

`lib/email/digest/template.tsx` — React Email layout with:
- Header (Faye logo text, date)
- Per-campaign block:
  - Yesterday's metrics summary
  - "Pending ads going live in 30 minutes" list with: asset thumbnail, audience name, copy preview, "Reject" CTA link

`lib/email/digest/send.ts`:
```ts
export async function sendDailyDigest(args: { date: string; digests: CampaignDigest[] }): Promise<string> {
  const html = await render(DigestEmail({ ...args }));
  const { data, error } = await resend.emails.send({
    from: env().RESEND_FROM,
    to: env().OPERATOR_EMAIL,
    subject: `Faye daily digest — ${args.date}`,
    html,
  });
  if (error) throw new Error(error.message);
  await db.insert(notifications).values({
    campaignId: null,
    kind: "daily_digest",
    payload: { campaignIds: args.digests.map((d) => d.campaignId), msgId: data?.id },
  });
  return data!.id;
}
```

Tests mock Resend (matching the Plan 1 pattern) and assert HTML contains each campaign name + each pending ad headline + a reject link.

Commit `digest template + sender`.

---

### Task 5: Reject confirm page + action

`app/reject/[token]/page.tsx`:
```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { verifyRejectToken } from "@/lib/email/reject-tokens";
import { getAdSummary } from "@/lib/ads/queries";   // tiny helper that returns headline + asset + audience name
import { rejectAction } from "./actions";

export default async function RejectPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const v = await verifyRejectToken(token);
  if (!v.ok) {
    return <main className="max-w-md mx-auto p-8"><h1 className="text-xl">Link {v.reason}</h1></main>;
  }
  const ad = await getAdSummary(v.adId);
  if (!ad) redirect("/");
  return (
    <main className="max-w-md mx-auto p-8 space-y-4">
      <h1 className="text-xl font-semibold">Reject this ad?</h1>
      <p className="text-sm text-muted-foreground">{ad.audienceName}</p>
      <img src={ad.assetUrl} alt="" className="w-full rounded" />
      <p className="font-medium">{ad.copyHeadline}</p>
      <p className="text-sm">{ad.copyPrimaryText}</p>
      <form action={rejectAction.bind(null, token)}>
        <button className="w-full h-10 bg-red-600 text-white rounded">Confirm reject</button>
      </form>
      <Link href="/" className="block text-center text-sm underline">Cancel</Link>
    </main>
  );
}
```

`app/reject/[token]/actions.ts`:
```ts
"use server";
import { redirect } from "next/navigation";
import { verifyRejectToken, consumeRejectToken } from "@/lib/email/reject-tokens";
import { db } from "@/lib/db";
import { ads } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { writeAudit } from "@/lib/audit/log";

export async function rejectAction(token: string) {
  const v = await verifyRejectToken(token);
  if (!v.ok) redirect("/");
  await db.update(ads).set({ status: "rejected", rejectedAt: new Date(), rejectedReason: "operator" }).where(eq(ads.id, v.adId));
  await consumeRejectToken({ nonce: v.nonce, adId: v.adId });
  await writeAudit({ entityType: "ad", entityId: v.adId, event: "rejected_via_email" });
  redirect(`/campaigns?msg=ad-rejected`);
}
```

End-to-end test (`tests/reject-flow.test.ts`): create campaign+ad → mint token → invoke `rejectAction` → ad row should be `rejected`, token consumed, second use should be rejected by `verifyRejectToken`.

Commit `reject confirm page + action`.

---

### Task 6: Publisher tick respects rejected

In Plan 5 the publisher tick already filtered `status='pending'` only, but make explicit that `rejected` ads are never selected. Add a defensive guard inside `publishAd` (Plan 4):

```ts
if (ad.status === "rejected") throw new Error("cannot publish rejected ad");
```

Test: rejecting then ticking should NOT publish.

Commit `publisher respects rejected`.

---

### Task 7: Wire digest after daily loop

Modify `lib/loop/daily.ts` to call `sendDailyDigest` after staging pending ads (collect a list of `CampaignDigest` across all campaigns processed in this run, then emit once). Easier: `scripts/daily.ts` after running the loop calls a new `scripts/digest.ts` flow OR consolidates within one script.

Approach: keep them separate. `scripts/daily.ts` writes pending ads; `scripts/digest.ts --all` reads all campaigns that had pending ads created today and emits one consolidated digest.

Cron:
```
0 * * * * cd /opt/faye && /usr/bin/pnpm exec tsx scripts/daily.ts --all && /usr/bin/pnpm exec tsx scripts/digest.ts --all
```

Commit `wire digest after daily`.

---

### Task 8: In-app pending review (optional but nice)

Add `/campaigns/[id]/review` listing today's `pending` ads with approve-now (clears `publishAt`, advances publisher) + reject buttons. Mirrors the email but lets the operator approve in bulk from the dashboard.

Commit `in-app review queue`.

---

## Done

After Task 8:
- Each morning operator receives a digest email summarizing yesterday's results + today's pending ads
- Per-ad reject links work, expire after 24h, single-use
- Rejected ads never publish
- Optional in-app review queue exists

**Next plan:** Plan 8 — Dashboards + cost tracking + polish.
