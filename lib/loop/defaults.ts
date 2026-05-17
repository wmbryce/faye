import { getSecret } from "@/lib/secrets/queries";

const DEFAULT_MODELS = {
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

async function readModelSecret(key: string): Promise<string | null> {
  try {
    const raw = await getSecret(key);
    const trimmed = raw?.trim();
    return trimmed ? trimmed : null;
  } catch {
    return null;
  }
}

export async function resolveModels(): Promise<ResolvedModels> {
  // Read each secret tolerantly: a single failure or blank value falls back to
  // the static default, instead of taking the other two down with it.
  const [c, g, s] = await Promise.all([
    readModelSecret("llm.model.critique"),
    readModelSecret("llm.model.generate"),
    readModelSecret("llm.model.safety"),
  ]);
  return {
    critique: c ?? DEFAULT_MODELS.critique,
    generate: g ?? DEFAULT_MODELS.generate,
    safety:   s ?? DEFAULT_MODELS.safety,
  };
}
