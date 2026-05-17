import type { SpotifyClient } from "./client";
import { fetchWithBackoff, assertOk, type FetchOpts } from "@/lib/external/fetch";
import { ArtistPopularity, TrackSummary, DailyStreams } from "./types";

const ACCOUNTS = "https://accounts.spotify.com/api/token";
const API = "https://api.spotify.com/v1";
const TOKEN_TTL_BUFFER_MS = 30_000;

type WebOpts = { clientId: string; clientSecret: string; fetchOpts?: Partial<FetchOpts> };

type TokenResponse = { access_token: string; expires_in: number };
type ArtistResponse = { popularity?: number; followers?: { total?: number } };
type TrackResponse = { id: string; name: string; popularity?: number };

/**
 * Web API client using the client-credentials flow. Token cached in memory with TTL buffer.
 * Available for any artist; provides popularity + follower data but NOT raw stream counts.
 */
export function makeSpotifyWebClient(args: WebOpts): SpotifyClient {
  let token: { value: string; expiresAt: number } | null = null;
  const fetchOpts = (extra?: Partial<FetchOpts>) => ({ service: "spotify_web", ...args.fetchOpts, ...extra });

  async function getToken(): Promise<string> {
    if (token && token.expiresAt - TOKEN_TTL_BUFFER_MS > Date.now()) return token.value;
    const basic = Buffer.from(`${args.clientId}:${args.clientSecret}`).toString("base64");
    const res = await fetchWithBackoff(ACCOUNTS, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    }, fetchOpts());
    await assertOk(res, "spotify token");
    const j = (await res.json()) as TokenResponse;
    token = { value: j.access_token, expiresAt: Date.now() + j.expires_in * 1000 };
    return token.value;
  }

  async function authedFetch(url: string): Promise<Response> {
    const t = await getToken();
    return fetchWithBackoff(url, {
      method: "GET",
      headers: { "Authorization": `Bearer ${t}` },
    }, fetchOpts());
  }

  return {
    async getArtistPopularity(artistId) {
      const res = await authedFetch(`${API}/artists/${encodeURIComponent(artistId)}`);
      await assertOk(res, "spotify artist");
      const j = (await res.json()) as ArtistResponse;
      return ArtistPopularity.parse({
        popularity: j.popularity ?? 0,
        followers: j.followers?.total ?? 0,
      });
    },

    async getTrack(trackId) {
      const res = await authedFetch(`${API}/tracks/${encodeURIComponent(trackId)}`);
      await assertOk(res, "spotify track");
      const j = (await res.json()) as TrackResponse;
      return TrackSummary.parse({ id: j.id, title: j.name, popularity: j.popularity ?? 0 });
    },

    async getDailyStreams() {
      // Web API does not expose per-day stream counts. Caller should pair with S4A or degrade.
      return DailyStreams.parse({ streams: null, listeners: null, source: "web_estimate" });
    },
  };
}
