import type { SpotifyClient } from "./client";
import type { FetchOpts } from "@/lib/external/fetch";
import { fetchWithBackoff } from "@/lib/external/fetch";
import { DailyStreams } from "./types";

// NOTE: Spotify for Artists API is invite-only / partner-program. Endpoint paths +
// auth header conventions below are placeholders to be revised once we have docs +
// real access. Until then this code path is unreachable (factory returns mock when
// no S4A token is configured for an artist).
const S4A_BASE = "https://api.spotifyforartists.com/v1";

type S4AOpts = {
  /** Wraps a Web client to satisfy the popularity/track endpoints not covered by S4A. */
  webClient: SpotifyClient;
  /** Per-artist OAuth token from artist.spotifyForArtistsToken. */
  s4aToken: string;
  fetchOpts?: Partial<FetchOpts>;
};

type DailyResponse = { streams?: number | null; listeners?: number | null };

export function makeSpotifyS4AClient(args: S4AOpts): SpotifyClient {
  const opts = (extra?: Partial<FetchOpts>) => ({ service: "spotify_s4a", ...args.fetchOpts, ...extra });

  return {
    getArtistPopularity: (id) => args.webClient.getArtistPopularity(id),
    getTrack: (id) => args.webClient.getTrack(id),
    async getDailyStreams({ artistId, trackId, date }) {
      const url = trackId
        ? `${S4A_BASE}/artists/${encodeURIComponent(artistId)}/tracks/${encodeURIComponent(trackId)}/daily?date=${date}`
        : `${S4A_BASE}/artists/${encodeURIComponent(artistId)}/daily?date=${date}`;
      const res = await fetchWithBackoff(url, {
        method: "GET",
        headers: { "Authorization": `Bearer ${args.s4aToken}` },
      }, opts());
      if (!res.ok) {
        // Degrade silently — the external_calls log retains the failure for triage.
        // We avoid throwing here because S4A is an enhancement to the composite score,
        // not a hard requirement; the Web client always returns a usable fallback.
        return DailyStreams.parse({ streams: null, listeners: null, source: "web_estimate" });
      }
      try {
        const j = (await res.json()) as DailyResponse;
        return DailyStreams.parse({
          streams: j.streams ?? null,
          listeners: j.listeners ?? null,
          source: "s4a",
        });
      } catch {
        // shape-drifted payload — degrade rather than crash the caller
        return DailyStreams.parse({ streams: null, listeners: null, source: "web_estimate" });
      }
    },
  };
}
