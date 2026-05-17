import type { FBClient } from "./client";
import type { FetchOpts } from "@/lib/external/fetch";
import { fetchWithBackoff } from "@/lib/external/fetch";
import { AdInsights, FBId } from "./types";

const GRAPH = "https://graph.facebook.com/v21.0";

export function makeFBRealClient(args: {
  accessToken: string;
  fetchOpts?: Partial<FetchOpts>;
}): FBClient {
  const opts = (extra?: Partial<FetchOpts>) => ({ service: "fb", ...args.fetchOpts, ...extra });

  async function post(path: string, body: Record<string, unknown>): Promise<any> {
    const entries: Record<string, string> = {};
    for (const [k, v] of Object.entries(body)) {
      entries[k] = typeof v === "string" ? v : JSON.stringify(v);
    }
    entries["access_token"] = args.accessToken;
    const encoded = Object.entries(entries)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join("&");
    const res = await fetchWithBackoff(`${GRAPH}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: encoded,
    }, opts());
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`fb ${path}: ${res.status} ${text}`);
    }
    return res.json();
  }

  async function get(path: string, query: Record<string, string> = {}): Promise<any> {
    const params = new URLSearchParams(query);
    params.set("access_token", args.accessToken);
    const res = await fetchWithBackoff(`${GRAPH}${path}?${params.toString()}`, {
      method: "GET",
    }, opts());
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`fb ${path}: ${res.status} ${text}`);
    }
    return res.json();
  }

  return {
    async createCampaign(input) {
      const j = await post(`/act_${stripAct(input.adAccountId)}/campaigns`, {
        name: input.name,
        objective: input.objective,
        status: input.status,
        special_ad_categories: [],
      });
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
      });
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
      });
      return FBId.parse({ id: j.id });
    },

    async createAd(input) {
      const j = await post(`/act_${stripAct(input.adAccountId)}/ads`, {
        name: input.name,
        adset_id: input.adSetId,
        creative: { creative_id: input.creativeId },
        status: input.status,
      });
      return FBId.parse({ id: j.id });
    },

    async pauseAd(adId) { await post(`/${adId}`, { status: "PAUSED" }); },
    async archiveAd(adId) { await post(`/${adId}`, { status: "ARCHIVED" }); },
    async setAdSetDailyBudget(adSetId, cents) { await post(`/${adSetId}`, { daily_budget: cents }); },

    async getAdInsights(adId, date) {
      const j = await get(`/${adId}/insights`, {
        fields: "spend,impressions,inline_link_clicks,ctr,cpc",
        time_range: JSON.stringify({ since: date, until: date }),
      });
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

function stripAct(adAccountId: string): string {
  return adAccountId.startsWith("act_") ? adAccountId.slice(4) : adAccountId;
}
