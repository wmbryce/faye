import { env } from "@/lib/env";
import { getSecret } from "@/lib/secrets/queries";
import { getArtist } from "@/lib/artists/queries";
import { makeSpotifyWebClient } from "./web";
import { makeSpotifyS4AClient } from "./s4a";
import { makeMockSpotifyClient } from "./mock";
import type { SpotifyClient } from "./client";

// Memoize web clients at module scope so the in-instance OAuth token cache survives
// across per-request factory calls. Keyed by clientId — credentials are stable for the
// process lifetime, and rotation requires a deploy anyway.
const webClientCache = new Map<string, SpotifyClient>();

function getWebClient(clientId: string, clientSecret: string): SpotifyClient {
  let c = webClientCache.get(clientId);
  if (!c) {
    c = makeSpotifyWebClient({ clientId, clientSecret });
    webClientCache.set(clientId, c);
  }
  return c;
}

/**
 * Returns a SpotifyClient tailored to the given artist.
 * - test env → mock
 * - artist has S4A token → S4A wrapping Web
 * - otherwise → Web only (getDailyStreams returns degraded web_estimate)
 */
export async function makeSpotifyClient(args?: { artistId?: string }): Promise<SpotifyClient> {
  if (env().NODE_ENV === "test") return makeMockSpotifyClient();
  const [clientId, clientSecret] = await Promise.all([
    getSecret("spotify.client_id"),
    getSecret("spotify.client_secret"),
  ]);
  if (!clientId || !clientSecret) throw new Error("missing spotify.client_id or spotify.client_secret (set in /settings)");
  const web = getWebClient(clientId, clientSecret);
  if (!args?.artistId) return web;
  const artist = await getArtist(args.artistId);
  if (!artist?.spotifyForArtistsToken) return web;
  return makeSpotifyS4AClient({ webClient: web, s4aToken: artist.spotifyForArtistsToken });
}
