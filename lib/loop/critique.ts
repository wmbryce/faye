import type { LLMClient } from "@/lib/llm/client";
import type { Message } from "@/lib/llm/types";
import { promptHash, logLLMRun } from "@/lib/llm/runs";

export type CritiqueAd = {
  copyHeadline: string;
  copyPrimaryText: string;
  cpcCents: number;
  smartlinkClicks: number;
  smartlinkStreams: number | null;
};

export type CritiqueInput = {
  contextBlock: Message;
  survivors: CritiqueAd[];
  killed: CritiqueAd[];
  campaignId: string;
  date: string;
  model: string;
};

export type CritiqueOutput = {
  winningThemes: string[];
  tiredThemes: string[];
  notes: string;
};

const SYSTEM_INSTRUCTIONS = `You analyze Facebook ad performance for a music artist's Spotify campaign.
You are given recent winning ads (low CPC, good clicks/streams) and recently killed ads (poor performance).
Output ONLY valid JSON in this shape:
{ "winningThemes": [up to 3 short strings], "tiredThemes": [up to 3 short strings], "notes": "max 200 chars" }
Winning themes = angles, tones, hooks that work. Tired themes = avoid these.`;

const MAX_TOKENS = 600;
const TEMPERATURE = 0.2;

export async function runCritique(client: LLMClient, input: CritiqueInput): Promise<CritiqueOutput> {
  const userText = formatCritiqueData(input);
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

  const parsed = parseCritiqueOutput(resp.text);

  await logLLMRun({
    campaignId: input.campaignId,
    date: input.date,
    kind: "critique",
    model: input.model,
    inputTokens: resp.usage.input_tokens,
    outputTokens: resp.usage.output_tokens,
    cachedInputTokens: resp.usage.cached_input_tokens,
    costCents: resp.usage.cost_usd != null ? Math.round(resp.usage.cost_usd * 100) : null,
    promptHash: promptHash(messages),
    output: parsed,
  });

  return parsed;
}

function formatCritiqueData(i: CritiqueInput): string {
  const line = (a: CritiqueAd) =>
    `[CPC ${a.cpcCents}¢, clicks ${a.smartlinkClicks}${a.smartlinkStreams != null ? `, streams ${a.smartlinkStreams}` : ""}] ${a.copyHeadline} — ${a.copyPrimaryText}`;
  return [
    "Winners (keep doing this):",
    i.survivors.length > 0 ? i.survivors.map(line).join("\n") : "(none yet)",
    "",
    "Killed (avoid these patterns):",
    i.killed.length > 0 ? i.killed.map(line).join("\n") : "(none yet)",
  ].join("\n");
}

/** Coerces the LLM's JSON response into our shape; defaults missing fields and clips strings. */
export function parseCritiqueOutput(text: string): CritiqueOutput {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { raw = {}; }
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const winningThemes = asStringArray(obj.winningThemes).slice(0, 3);
  const tiredThemes = asStringArray(obj.tiredThemes).slice(0, 3);
  const notes = (typeof obj.notes === "string" ? obj.notes : "").slice(0, 200);
  return { winningThemes, tiredThemes, notes };
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter(Boolean);
}
