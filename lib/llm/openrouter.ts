import type { LLMClient } from "./client";
import { fetchWithBackoff, type FetchOpts } from "@/lib/external/fetch";
import { GenerateRequest, GenerateResponse } from "./types";

const BASE = "https://openrouter.ai/api/v1";

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
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`openrouter ${res.status}: ${text}`);
      }
      const json: any = await res.json();
      const text = json.choices?.[0]?.message?.content ?? "";
      return GenerateResponse.parse({
        id: json.id,
        model: json.model,
        text,
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
