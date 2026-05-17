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
export async function buildArtistContextBlock(args: {
  artist: Artist;
  release: Release;
}): Promise<Message> {
  const assets = await listAssets(args.artist.id);
  const assetLines = assets.length === 0
    ? "(none uploaded)"
    : assets.map((a) => `- ${a.label || "(unlabeled)"} (${a.kind})`).join("\n");
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
