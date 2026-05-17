import type { FBClient } from "./client";
import type { AdInsights } from "./types";

export function makeFBMockClient(overrides?: {
  insights?: (adId: string, date: string) => AdInsights | null;
}): FBClient {
  let n = 1;
  const id = (prefix: string) => `${prefix}_${n++}`;
  return {
    async createCampaign() { return { id: id("fb_camp") }; },
    async createAdSet()     { return { id: id("fb_adset") }; },
    async createAdCreative() { return { id: id("fb_creative") }; },
    async createAd()         { return { id: id("fb_ad") }; },
    async pauseAd() { /* noop */ },
    async archiveAd() { /* noop */ },
    async setAdSetDailyBudget() { /* noop */ },
    async pauseAdSet() { /* noop */ },
    async resumeAdSet() { /* noop */ },
    async getAdInsights(adId, date) {
      return overrides?.insights?.(adId, date) ?? null;
    },
  };
}
