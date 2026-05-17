import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth/current-user";
import { pullDailyMetrics } from "@/lib/metrics/pull";
import { runBanditStep } from "@/lib/bandit/step";
import { publisherTick } from "@/lib/publisher/tick";
import { runDailyLoop } from "@/lib/loop/daily";
import { yesterdayISO } from "@/scripts/_shared";

type Script = "metrics-pull" | "bandit-step" | "publish-tick" | "daily";

function isScript(s: string): s is Script {
  return s === "metrics-pull" || s === "bandit-step" || s === "publish-tick" || s === "daily";
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
