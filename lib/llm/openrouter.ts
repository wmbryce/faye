import type { LLMClient } from "./client";
import { fetchWithBackoff, assertOk, type FetchOpts } from "@/lib/external/fetch";
import { GenerateRequest, GenerateResponse } from "./types";

const BASE = "https://openrouter.ai/api/v1";

type OpenRouterResponse = {
  id: string;
  model: string;
  choices?: Array<{ message?: { content?: string } }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    prompt_tokens_details?: { cached_tokens?: number };
    cost?: number;
  };
};

export function makeOpenRouterClient(args: {
  apiKey: string;
  appUrl: string;
  fetchOpts?: Partial<FetchOpts>;
}): LLMClient {
  return {
    async generate(req) {
      const parsed = GenerateRequest.parse(req);
      const res = await fetchWithBackoff(`${BASE}/chat/completions`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${args.apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": args.appUrl,
          "X-Title": "Faye",
        },
        body: JSON.stringify({
          model: parsed.model,
          messages: parsed.messages,
          temperature: parsed.temperature,
          max_tokens: parsed.max_tokens,
          response_format: parsed.response_format,
          usage: { include: true },
        }),
      }, { service: "llm", ...args.fetchOpts });
      await assertOk(res, "openrouter");
      const json = (await res.json()) as OpenRouterResponse;
      return GenerateResponse.parse({
        id: json.id,
        model: json.model,
        text: json.choices?.[0]?.message?.content ?? "",
        usage: {
          input_tokens: json.usage?.prompt_tokens ?? 0,
          output_tokens: json.usage?.completion_tokens ?? 0,
          cached_input_tokens: json.usage?.prompt_tokens_details?.cached_tokens ?? 0,
          cost_usd: json.usage?.cost ?? null,
        },
      });
    },
  };
}
