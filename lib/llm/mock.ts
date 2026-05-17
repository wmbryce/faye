import type { LLMClient } from "./client";
import type { GenerateRequest, GenerateResponse } from "./types";

export function makeMockLLMClient(
  stub?: (req: GenerateRequest) => Partial<GenerateResponse>,
): LLMClient {
  return {
    async generate(req) {
      const override = stub?.(req) ?? {};
      return {
        id: override.id ?? "mock_1",
        model: override.model ?? req.model,
        text: override.text ?? "mock response",
        usage: {
          input_tokens: override.usage?.input_tokens ?? 10,
          output_tokens: override.usage?.output_tokens ?? 5,
          cached_input_tokens: override.usage?.cached_input_tokens ?? 0,
          cost_usd: override.usage?.cost_usd ?? null,
        },
      };
    },
  };
}
