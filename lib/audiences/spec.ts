import { z } from "zod";

export const TargetingSpec = z.object({
  geo: z.object({
    countries: z.array(z.string().length(2)).min(1),
    cities: z.array(z.string()).optional(),
  }),
  age_min: z.number().int().min(13).max(65).optional(),
  age_max: z.number().int().min(13).max(65).optional(),
  interests: z.array(z.string()).optional(),
  lookalikes: z.array(z.string()).optional(),
  languages: z.array(z.string()).optional(),
});
export type TargetingSpec = z.infer<typeof TargetingSpec>;
