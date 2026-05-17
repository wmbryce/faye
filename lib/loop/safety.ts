import type { LLMClient } from "@/lib/llm/client";
import type { Message } from "@/lib/llm/types";
import { promptHash, logLLMRun } from "@/lib/llm/runs";
import type { AdVariant } from "./generate";

export type SafetyVerdict = {
  variantIndex: number;
  ok: boolean;
  reasons: string[];
};

const SYSTEM_INSTRUCTIONS = `You are a Meta ad-policy compliance classifier. Given an ad variant, return ONLY valid JSON:
{ "ok": boolean, "reasons": [strings] }
Reasons to fail (set ok=false):
- false claims or guarantees ("get rich quick", "earn $X")
- superlatives implying guaranteed results
- targeting of personal attributes (age, gender, race, health, finances)
- promises of "results" or "free money"
- deceptive scarcity ("only today")
If the copy is clean, return { "ok": true, "reasons": [] }.`;

const MAX_TOKENS = 200;
const TEMPERATURE = 0;

export type RunSafetyArgs = {
  variants: AdVariant[];
  contextBlock: Message;
  campaignId: string;
  date: string;
  model: string;
};

export async function runSafety(client: LLMClient, args: RunSafetyArgs): Promise<SafetyVerdict[]> {
  const verdicts: SafetyVerdict[] = [];
  for (let i = 0; i < args.variants.length; i++) {
    verdicts.push(await classifyOne(client, args, i));
  }
  return verdicts;
}

async function classifyOne(client: LLMClient, args: RunSafetyArgs, i: number): Promise<SafetyVerdict> {
  const v = args.variants[i];
  const messages: Message[] = [
    args.contextBlock,
    { role: "system", content: SYSTEM_INSTRUCTIONS },
    {
      role: "user",
      content: [
        `Headline: ${v.copyHeadline}`,
        `Primary: ${v.copyPrimaryText}`,
        `Body: ${v.copyBody}`,
      ].join("\n"),
    },
  ];

  const resp = await client.generate({
    model: args.model,
    messages,
    temperature: TEMPERATURE,
    response_format: { type: "json_object" },
    max_tokens: MAX_TOKENS,
  });

  const parsed = parseSafetyOutput(resp.text);

  await logLLMRun({
    campaignId: args.campaignId,
    date: args.date,
    kind: "safety",
    model: args.model,
    inputTokens: resp.usage.input_tokens,
    outputTokens: resp.usage.output_tokens,
    cachedInputTokens: resp.usage.cached_input_tokens,
    costCents: resp.usage.cost_usd != null ? Math.round(resp.usage.cost_usd * 100) : null,
    promptHash: promptHash(messages),
    output: { variantIndex: i, ...parsed },
  });

  return { variantIndex: i, ok: parsed.ok, reasons: parsed.reasons };
}

/**
 * Fail-closed: if the classifier returns garbage we mark the variant as NOT ok
 * so we don't accidentally publish a borderline ad against Meta policy.
 */
export function parseSafetyOutput(text: string): { ok: boolean; reasons: string[] } {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return { ok: false, reasons: ["unparseable safety verdict"] }; }
  if (!raw || typeof raw !== "object") return { ok: false, reasons: ["non-object safety verdict"] };
  const obj = raw as Record<string, unknown>;
  const ok = typeof obj.ok === "boolean" ? obj.ok : false;
  const reasons = Array.isArray(obj.reasons)
    ? obj.reasons.filter((r): r is string => typeof r === "string").map((r) => r.trim()).filter(Boolean)
    : [];
  return { ok, reasons };
}
