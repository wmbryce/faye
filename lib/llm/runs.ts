import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import { llmRuns } from "@/lib/db/schema";

/** Stable short hash of the message array — used to dedupe + correlate runs.
 *  Uses JSON.stringify so message boundaries can't collide via embedded newlines. */
export function promptHash(messages: { content: string }[]): string {
  return createHash("sha256")
    .update(JSON.stringify(messages.map((m) => m.content)))
    .digest("hex")
    .slice(0, 16);
}

export type LogLLMRunArgs = {
  campaignId: string | null;
  date: string;
  kind: "critique" | "generate" | "safety";
  model: string;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  costCents: number | null;
  promptHash: string;
  output: unknown;
};

export async function logLLMRun(args: LogLLMRunArgs): Promise<void> {
  await db.insert(llmRuns).values({
    campaignId: args.campaignId,
    date: args.date,
    kind: args.kind,
    model: args.model,
    inputTokens: args.inputTokens,
    outputTokens: args.outputTokens,
    cachedInputTokens: args.cachedInputTokens,
    costCents: args.costCents,
    promptHash: args.promptHash,
    output: args.output ?? null,
  });
}

/** Compute cost in cents from a per-million-token rate table. Used when the
 *  upstream provider didn't return a cost. v1 callers can omit this. */
export function estimateCostCents(args: {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens?: number;
  inputUsdPerM: number;
  outputUsdPerM: number;
  cachedInputUsdPerM?: number;
}): number {
  const cachedRate = args.cachedInputUsdPerM ?? args.inputUsdPerM * 0.1;
  // Clamp inputs so a misreporting upstream (e.g., cachedInputTokens > inputTokens
  // or negative counts) can't drive cost negative.
  const input = Math.max(0, args.inputTokens);
  const output = Math.max(0, args.outputTokens);
  const cached = Math.max(0, Math.min(args.cachedInputTokens ?? 0, input));
  const freshInput = input - cached;
  const usd =
    freshInput * (args.inputUsdPerM / 1_000_000) +
    cached * (cachedRate / 1_000_000) +
    output * (args.outputUsdPerM / 1_000_000);
  return Math.round(usd * 100);
}
