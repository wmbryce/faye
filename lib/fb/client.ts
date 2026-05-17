import type { FBId, AdInsights } from "./types";

/**
 * FB Marketing API client.
 *
 * All `create*` methods require `adAccountId` because FB scopes those endpoints by ad
 * account (`/act_<id>/{campaigns,adsets,adcreatives,ads}`). Subsequent mutations
 * (`pauseAd`, `archiveAd`, `setAdSetDailyBudget`) operate on the object ID directly.
 */
export interface FBClient {
  createCampaign(input: {
    adAccountId: string;
    name: string;
    objective: "OUTCOME_TRAFFIC";
    status: "PAUSED" | "ACTIVE";
  }): Promise<FBId>;

  createAdSet(input: {
    adAccountId: string;
    campaignId: string;
    name: string;
    dailyBudgetCents: number;
    targetingSpec: unknown;
    optimization: "LINK_CLICKS";
    startTime: Date;
    endTime?: Date;
    status: "PAUSED" | "ACTIVE";
  }): Promise<FBId>;

  createAdCreative(input: {
    adAccountId: string;
    pageId: string;
    headline: string;
    primaryText: string;
    body: string;
    imageUrl: string;
    landingUrl: string;
  }): Promise<FBId>;

  createAd(input: {
    adAccountId: string;
    adSetId: string;
    creativeId: string;
    name: string;
    status: "PAUSED" | "ACTIVE";
  }): Promise<FBId>;

  pauseAd(adId: string): Promise<void>;
  archiveAd(adId: string): Promise<void>;
  setAdSetDailyBudget(adSetId: string, cents: number): Promise<void>;
  pauseAdSet(adSetId: string): Promise<void>;
  resumeAdSet(adSetId: string): Promise<void>;

  getAdInsights(adId: string, date: string): Promise<AdInsights | null>;
}
