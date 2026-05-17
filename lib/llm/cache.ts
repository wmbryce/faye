import type { Message } from "./types";

/**
 * Mark a message block as ephemeral-cached (OpenRouter pass-through to Anthropic).
 * Used on the per-artist context block that's stable across critique/generate/safety calls.
 */
export function cacheArtistContext(block: Message): Message {
  return { ...block, cache_control: { type: "ephemeral" } };
}
