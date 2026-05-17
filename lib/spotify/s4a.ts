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
        // degrade silently — return web_estimate shape
        return DailyStreams.parse({ streams: null, listeners: null, source: "web_estimate" });
      }
      const j: any = await res.json();
      return DailyStreams.parse({
        streams: j.streams ?? null,
        listeners: j.listeners ?? null,
        source: "s4a",
      });
    },
  };
}
