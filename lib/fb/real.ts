import type { FBClient } from "./client";
import type { FetchOpts } from "@/lib/external/fetch";
import { fetchWithBackoff, assertOk } from "@/lib/external/fetch";
import { AdInsights, FBId } from "./types";

const GRAPH = "https://graph.facebook.com/v21.0";

/** Strip the `act_` prefix from a FB ad-account ID. */
export function stripAct(adAccountId: string): string {
  return adAccountId.startsWith("act_") ? adAccountId.slice(4) : adAccountId;
}

export function makeFBRealClient(args: {
  accessToken: string;
  fetchOpts?: Partial<FetchOpts>;
}): FBClient {
  const opts = (extra?: Partial<FetchOpts>) => ({ service: "fb", ...args.fetchOpts, ...extra });

  const authHeader = { "Authorization": `Bearer ${args.accessToken}` } as const;

  async function post(path: string, body: Record<string, unknown>): Promise<unknown> {
    const entries: Record<string, string> = {};
    for (const [k, v] of Object.entries(body)) {
      if (v === undefined) continue;
      const serialized = typeof v === "string" ? v : JSON.stringify(v);
      if (serialized === undefined) continue;
      entries[k] = serialized;
    }
    const encoded = Object.entries(entries)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join("&");
    const res = await fetchWithBackoff(`${GRAPH}${path}`, {
      method: "POST",
      headers: { ...authHeader, "Content-Type": "application/x-www-form-urlencoded" },
      body: encoded,
    }, opts());
    await assertOk(res, `fb ${path}`);
    return res.json();
  }

  async function get(path: string, query: Record<string, string> = {}): Promise<unknown> {
    const params = new URLSearchParams(query);
    const qs = params.toString();
    const url = qs ? `${GRAPH}${path}?${qs}` : `${GRAPH}${path}`;
    const res = await fetchWithBackoff(url, {
      method: "GET",
      headers: authHeader,
    }, opts());
    await assertOk(res, `fb ${path}`);
    return res.json();
  }

  return {
    async createCampaign(input) {
      const j = await post(`/act_${stripAct(input.adAccountId)}/campaigns`, {
        name: input.name,
        objective: input.objective,
        status: input.status,
        special_ad_categories: [],
      }) as { id: string };
      return FBId.parse({ id: j.id });
    },

    async createAdSet(input) {
      const j = await post(`/act_${stripAct(input.adAccountId)}/adsets`, {
        name: input.name,
        campaign_id: input.campaignId,
        daily_budget: input.dailyBudgetCents,
        billing_event: "IMPRESSIONS",
        optimization_goal: input.optimization,
        targeting: input.targetingSpec,
        start_time: input.startTime.toISOString(),
        end_time: input.endTime?.toISOString(),
        status: input.status,
      }) as { id: string };
      return FBId.parse({ id: j.id });
    },

    async createAdCreative(input) {
      const j = await post(`/act_${stripAct(input.adAccountId)}/adcreatives`, {
        name: input.headline.slice(0, 40),
        object_story_spec: {
          page_id: input.pageId,
          link_data: {
            link: input.landingUrl,
            message: input.primaryText,
            name: input.headline,
            description: input.body,
            picture: input.imageUrl,
          },
        },
      }) as { id: string };
      return FBId.parse({ id: j.id });
    },

    async createAd(input) {
      const j = await post(`/act_${stripAct(input.adAccountId)}/ads`, {
        name: input.name,
        adset_id: input.adSetId,
        creative: { creative_id: input.creativeId },
        status: input.status,
      }) as { id: string };
      return FBId.parse({ id: j.id });
    },

    async pauseAd(adId) { await post(`/${adId}`, { status: "PAUSED" }); },
    async archiveAd(adId) { await post(`/${adId}`, { status: "ARCHIVED" }); },
    async setAdSetDailyBudget(adSetId, cents) { await post(`/${adSetId}`, { daily_budget: cents }); },
    async pauseAdSet(adSetId) { await post(`/${adSetId}`, { status: "PAUSED" }); },
    async resumeAdSet(adSetId) { await post(`/${adSetId}`, { status: "ACTIVE" }); },

    async getAdInsights(adId, date) {
      const j = await get(`/${adId}/insights`, {
        fields: "spend,impressions,inline_link_clicks,ctr,cpc",
        time_range: JSON.stringify({ since: date, until: date }),
      }) as { data?: Array<Record<string, unknown>> };
      const row = j.data?.[0];
      if (!row) return null;
      const spendUsd = Number(row.spend ?? 0);
      return AdInsights.parse({
        spendCents: Math.round(spendUsd * 100),
        impressions: Number(row.impressions ?? 0),
        linkClicks: Number(row.inline_link_clicks ?? 0),
        ctr: Number(row.ctr ?? 0),
        cpc: Number(row.cpc ?? 0),
      });
    },
  };
}
