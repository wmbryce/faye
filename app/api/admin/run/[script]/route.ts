import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth/current-user";
import { pullDailyMetrics } from "@/lib/metrics/pull";
import { runBanditStep } from "@/lib/bandit/step";
import { publisherTick } from "@/lib/publisher/tick";
import { runDailyLoop } from "@/lib/loop/daily";
import { yesterdayISO } from "@/scripts/_shared";
import { buildCampaignDigest } from "@/lib/email/digest/builder";
import { sendDailyDigest } from "@/lib/email/digest/send";
import { db } from "@/lib/db";
import { campaigns, ads } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

type Script = "metrics-pull" | "bandit-step" | "publish-tick" | "daily" | "digest";

function isScript(s: string): s is Script {
  return s === "metrics-pull" || s === "bandit-step" || s === "publish-tick" || s === "daily" || s === "digest";
}

export async function POST(req: Request, ctx: { params: Promise<{ script: string }> }) {
  if (!(await currentUser())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { script } = await ctx.params;
  if (!isScript(script)) {
    return NextResponse.json({ error: "unknown script" }, { status: 400 });
  }
  const body = await req.json().catch(() => ({}));
  const campaignId: string | undefined = typeof body.campaignId === "string" ? body.campaignId : undefined;
  const date: string | undefined = typeof body.date === "string" ? body.date : undefined;

  try {
    if (script === "publish-tick") {
      const r = await publisherTick();
      return NextResponse.json(r);
    }
    if (script === "digest") {
      // Build a single-campaign digest if campaignId given; otherwise build for all active campaigns with pending ads.
      let digests = [];
      if (campaignId) {
        digests = [await buildCampaignDigest({ campaignId, yesterday: date ?? yesterdayISO() })];
      } else {
        const rows = await db.selectDistinct({ id: campaigns.id }).from(campaigns)
          .innerJoin(ads, eq(ads.campaignId, campaigns.id))
          .where(and(eq(campaigns.status, "active"), eq(ads.status, "pending")));
        for (const r of rows) digests.push(await buildCampaignDigest({ campaignId: r.id, yesterday: date ?? yesterdayISO() }));
      }
      if (digests.length === 0) return NextResponse.json({ sent: 0, msgId: null });
      const msgId = await sendDailyDigest({ date: date ?? yesterdayISO(), digests });
      return NextResponse.json({ sent: digests.length, msgId });
    }
    if (!campaignId) {
      return NextResponse.json({ error: "campaignId required for this script" }, { status: 400 });
    }
    if (script === "metrics-pull") {
      const r = await pullDailyMetrics({ campaignId, date: date ?? yesterdayISO() });
      return NextResponse.json(r);
    }
    if (script === "bandit-step") {
      const r = await runBanditStep({ campaignId, date: date ?? yesterdayISO() });
      return NextResponse.json(r);
    }
    if (script === "daily") {
      // Omit yesterday when not explicitly provided; runDailyLoop derives artist-local yesterday.
      const r = await runDailyLoop({ campaignId, ...(date ? { yesterday: date } : {}) });
      return NextResponse.json(r);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message, script, campaignId }, { status: 500 });
  }
  return NextResponse.json({ error: "unreachable" }, { status: 500 });
}
