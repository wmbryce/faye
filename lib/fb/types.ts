import { z } from "zod";

export const FBId = z.object({ id: z.string() });
export type FBId = z.infer<typeof FBId>;

export const AdInsights = z.object({
  spendCents: z.number().int().nonnegative(),
  impressions: z.number().int().nonnegative(),
  linkClicks: z.number().int().nonnegative(),
  ctr: z.number().nonnegative(),
  cpc: z.number().nonnegative(),
});
export type AdInsights = z.infer<typeof AdInsights>;
