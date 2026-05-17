import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import { llmRuns } from "@/lib/db/schema";

/** Stable short hash of the joined message contents — used to dedupe + correlate runs. */
export function promptHash(messages: { content: string }[]): string {
  return createHash("sha256")
    .update(messages.map((m) => m.content).join("\n"))
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
  const usd =
    (args.inputTokens - (args.cachedInputTokens ?? 0)) * (args.inputUsdPerM / 1_000_000) +
    (args.cachedInputTokens ?? 0) * (cachedRate / 1_000_000) +
    args.outputTokens * (args.outputUsdPerM / 1_000_000);
  return Math.round(usd * 100);
}
