import type { SpotifyClient } from "./client";
import type { ArtistPopularity, TrackSummary, DailyStreams } from "./types";

export function makeMockSpotifyClient(overrides?: {
  popularity?: (artistId: string) => Partial<ArtistPopularity>;
  track?: (trackId: string) => Partial<TrackSummary>;
  dailyStreams?: (args: { artistId: string; trackId?: string; date: string }) => Partial<DailyStreams>;
}): SpotifyClient {
  return {
    async getArtistPopularity(artistId) {
      const o = overrides?.popularity?.(artistId) ?? {};
      return { popularity: o.popularity ?? 50, followers: o.followers ?? 1000 };
    },
    async getTrack(trackId) {
      const o = overrides?.track?.(trackId) ?? {};
      return { id: trackId, title: o.title ?? "Mock Track", popularity: o.popularity ?? 50 };
    },
    async getDailyStreams(args) {
      const o = overrides?.dailyStreams?.(args) ?? {};
      return {
        streams: o.streams ?? null,
        listeners: o.listeners ?? null,
        source: o.source ?? "web_estimate",
      };
    },
  };
}
