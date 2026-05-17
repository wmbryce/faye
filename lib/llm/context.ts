import type { Message } from "@/lib/llm/types";
import { listAssets } from "@/lib/assets/queries";
import { cacheArtistContext } from "@/lib/llm/cache";
import type { Artist, Release } from "@/lib/db/schema";

/**
 * Builds the per-artist context block used as a cached prefix for every LLM call
 * in the daily loop (critique → generate → safety). The prefix is stable across
 * a single run-day's calls, so OpenRouter pass-through prompt caching gives a
 * big cost reduction.
 */
const MAX_ASSETS_IN_PROMPT = 20;

export async function buildArtistContextBlock(args: {
  artist: Artist;
  release: Release;
}): Promise<Message> {
  const assets = await listAssets(args.artist.id);
  let assetLines: string;
  if (assets.length === 0) {
    assetLines = "(none uploaded)";
  } else {
    const shown = assets.slice(0, MAX_ASSETS_IN_PROMPT);
    const lines = shown.map((a) => `- ${a.label || "(unlabeled)"} (${a.kind})`);
    if (assets.length > MAX_ASSETS_IN_PROMPT) {
      lines.push(`(${assets.length - MAX_ASSETS_IN_PROMPT} more assets omitted)`);
    }
    assetLines = lines.join("\n");
  }
  const content = [
    "# Artist",
    `Name: ${args.artist.name}`,
    `Spotify ID: ${args.artist.spotifyArtistId}`,
    `Timezone: ${args.artist.timezone}`,
    "",
    "# Voice guide",
    args.artist.voiceGuide || "(none provided)",
    "",
    "# Release in this campaign",
    `Title: ${args.release.title}`,
    `Kind: ${args.release.kind}`,
    `Release date: ${args.release.releaseDate}`,
    "",
    "# Assets available for ad creative",
    assetLines,
  ].join("\n");
  return cacheArtistContext({ role: "system", content });
}
