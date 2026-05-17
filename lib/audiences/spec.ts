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
}).superRefine((value, ctx) => {
  if (
    value.age_min !== undefined &&
    value.age_max !== undefined &&
    value.age_min > value.age_max
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["age_max"],
      message: "age_max must be greater than or equal to age_min",
    });
  }
});
export type TargetingSpec = z.infer<typeof TargetingSpec>;
