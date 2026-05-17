import { getSecret } from "@/lib/secrets/queries";

export const DEFAULT_MODELS = {
  critique: "anthropic/claude-opus-4-7",
  generate: "anthropic/claude-sonnet-4-6",
  safety:   "anthropic/claude-haiku-4-5",
} as const;

export const DEFAULTS = {
  K_SURVIVORS: 3,
  N_VARIANTS_PER_AUDIENCE: 5,
  REVIEW_DELAY_MS: 30 * 60 * 1000,
  COLD_START_GENS: 4,
} as const;

export type ResolvedModels = {
  critique: string;
  generate: string;
  safety: string;
};

export async function resolveModels(): Promise<ResolvedModels> {
  const [c, g, s] = await Promise.all([
    getSecret("llm.model.critique"),
    getSecret("llm.model.generate"),
    getSecret("llm.model.safety"),
  ]);
  return {
    critique: c ?? DEFAULT_MODELS.critique,
    generate: g ?? DEFAULT_MODELS.generate,
    safety:   s ?? DEFAULT_MODELS.safety,
  };
}
