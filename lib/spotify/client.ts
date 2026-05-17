import type { ArtistPopularity, TrackSummary, DailyStreams } from "./types";

export interface SpotifyClient {
  getArtistPopularity(artistId: string): Promise<ArtistPopularity>;
  getTrack(trackId: string): Promise<TrackSummary>;
  /**
   * Streams may be null when S4A is unavailable for this artist; caller should degrade.
   * `source` is `"s4a"` when authoritative, `"web_estimate"` otherwise.
   */
  getDailyStreams(args: { artistId: string; trackId?: string; date: string }): Promise<DailyStreams>;
}
