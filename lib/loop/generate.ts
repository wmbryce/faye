import type { LLMClient } from "@/lib/llm/client";
import type { Message } from "@/lib/llm/types";
import { promptHash, logLLMRun } from "@/lib/llm/runs";
import type { CritiqueOutput } from "./critique";

export type AdVariant = {
  copyHeadline: string;     // <=40 chars (clipped post-parse)
  copyPrimaryText: string;  // <=125 chars (clipped post-parse)
  copyBody: string;         // <=200 chars
  assetHint: string;         // matches an asset label or "any"
};

export type GenerateInput = {
  contextBlock: Message;
  critique: CritiqueOutput;
  audienceDescription: string;
  n: number;
  campaignId: string;
  date: string;
  model: string;
};

const HEADLINE_MAX = 40;
const PRIMARY_TEXT_MAX = 125;
const BODY_MAX = 200;

const SYSTEM_INSTRUCTIONS = `You write Facebook ad copy for a music artist's Spotify campaign.
Output ONLY valid JSON in this shape:
{
  "variants": [
    {
      "copyHeadline": "<=40 chars",
      "copyPrimaryText": "<=125 chars",
      "copyBody": "<=200 chars",
      "assetHint": "string matching an asset label or 'any'"
    }
  ]
}
Rules:
- Each variant explores a DIFFERENT angle but stays in the winning voice.
- No false claims, no superlatives implying guaranteed results, no targeting of personal attributes (age/gender/health).`;

const MAX_TOKENS = 1200;
const TEMPERATURE = 0.9;

export async function runGenerate(client: LLMClient, input: GenerateInput): Promise<AdVariant[]> {
  const target = Number.isFinite(input.n) ? Math.max(0, Math.floor(input.n)) : 0;
  if (target === 0) return [];

  const userText = formatGenerateRequest(input);
  const messages: Message[] = [
    input.contextBlock,
    { role: "system", content: SYSTEM_INSTRUCTIONS },
    { role: "user", content: userText },
  ];

  const resp = await client.generate({
    model: input.model,
    messages,
    temperature: TEMPERATURE,
    response_format: { type: "json_object" },
    max_tokens: MAX_TOKENS,
  });

  const variants = parseGenerateOutput(resp.text, target);

  await logLLMRun({
    campaignId: input.campaignId,
    date: input.date,
    kind: "generate",
    model: input.model,
    inputTokens: resp.usage.input_tokens,
    outputTokens: resp.usage.output_tokens,
    cachedInputTokens: resp.usage.cached_input_tokens,
    costCents: resp.usage.cost_usd != null ? Math.round(resp.usage.cost_usd * 100) : null,
    promptHash: promptHash(messages),
    output: { variants },
  });

  return variants;
}

function formatGenerateRequest(i: GenerateInput): string {
  return [
    `Audience: ${i.audienceDescription}`,
    `Winning themes: ${i.critique.winningThemes.join("; ") || "(none yet — explore freely)"}`,
    `Tired themes (avoid): ${i.critique.tiredThemes.join("; ") || "(none yet)"}`,
    `Notes: ${i.critique.notes}`,
    `Write ${i.n} variants.`,
  ].join("\n");
}

/** Tolerant JSON parser: clips fields, drops malformed variants, truncates to N. */
export function parseGenerateOutput(text: string, n: number): AdVariant[] {
  const limit = Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
  if (limit === 0) return [];

  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return []; }
  const root = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const list = Array.isArray(root.variants) ? root.variants : [];
  const variants: AdVariant[] = [];
  for (const v of list) {
    if (!v || typeof v !== "object") continue;
    const obj = v as Record<string, unknown>;
    const copyHeadline = typeof obj.copyHeadline === "string" ? obj.copyHeadline.trim().slice(0, HEADLINE_MAX) : "";
    const copyPrimaryText = typeof obj.copyPrimaryText === "string" ? obj.copyPrimaryText.trim().slice(0, PRIMARY_TEXT_MAX) : "";
    const copyBody = typeof obj.copyBody === "string" ? obj.copyBody.trim().slice(0, BODY_MAX) : "";
    const assetHint = typeof obj.assetHint === "string" ? obj.assetHint.trim() : "any";
    if (!copyHeadline || !copyPrimaryText) continue;
    variants.push({ copyHeadline, copyPrimaryText, copyBody, assetHint: assetHint || "any" });
    if (variants.length >= limit) break;
  }
  return variants;
}
