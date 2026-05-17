import { z } from "zod";

export const Message = z.object({
  role: z.enum(["system", "user", "assistant"]),
  content: z.string(),
  cache_control: z.object({ type: z.literal("ephemeral") }).optional(),
});
export type Message = z.infer<typeof Message>;

export const GenerateRequest = z.object({
  model: z.string(),
  messages: z.array(Message),
  temperature: z.number().min(0).max(2).optional(),
  max_tokens: z.number().int().positive().optional(),
  response_format: z.object({ type: z.literal("json_object") }).optional(),
});
export type GenerateRequest = z.infer<typeof GenerateRequest>;

export const GenerateResponse = z.object({
  id: z.string(),
  model: z.string(),
  text: z.string(),
  usage: z.object({
    input_tokens: z.number().int().nonnegative(),
    output_tokens: z.number().int().nonnegative(),
    cached_input_tokens: z.number().int().nonnegative().default(0),
    cost_usd: z.number().nonnegative().nullable(),
  }),
});
export type GenerateResponse = z.infer<typeof GenerateResponse>;
