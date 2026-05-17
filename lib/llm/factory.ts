import { env } from "@/lib/env";
import { getSecret } from "@/lib/secrets/queries";
import { makeOpenRouterClient } from "./openrouter";
import { makeMockLLMClient } from "./mock";
import type { LLMClient } from "./client";

export async function makeLLMClient(): Promise<LLMClient> {
  if (env().NODE_ENV === "test") return makeMockLLMClient();
  const apiKey = await getSecret("openrouter.api_key");
  if (!apiKey) throw new Error("missing secret: openrouter.api_key (set in /settings)");
  return makeOpenRouterClient({ apiKey, appUrl: env().APP_URL });
}
