import type { SmartlinkClient } from "./client";
import { fetchWithBackoff, assertOk, type FetchOpts } from "@/lib/external/fetch";
import { Smartlink, SmartlinkMetrics, CreateSmartlinkInput } from "./types";

const BASE = "https://api.feature.fm/manage/v1";

type CreateResponse = { id: string; url?: string; shortUrl?: string; longUrl?: string };
type MetricsResponse = {
  totalClicks?: number;
  servicesClicks?: { spotify?: number };
  spotifyEstimatedStreams?: number | null;
};

export function makeFeatureFmClient(args: {
  apiKey: string;
  fetchOpts?: Partial<FetchOpts>;
}): SmartlinkClient {
  const headers = { "X-API-Key": args.apiKey, "Content-Type": "application/json" };
  const opts = (extra?: Partial<FetchOpts>) => ({ service: "smartlink", ...args.fetchOpts, ...extra });

  return {
    async create(input) {
      const body = CreateSmartlinkInput.parse(input);
      const res = await fetchWithBackoff(`${BASE}/actionPages`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          artist: { name: body.artistName },
          title: body.releaseTitle,
          slug: body.slug,
          actions: [{ type: "service", service: "spotify", url: body.spotifyTrackOrAlbumUrl }],
        }),
      }, opts());
      await assertOk(res, "featurefm create");
      const j = (await res.json()) as CreateResponse;
      return Smartlink.parse({
        id: j.id,
        shortUrl: j.url ?? j.shortUrl,
        longUrl: j.longUrl,
      });
    },

    async getDailyMetrics({ smartlinkId, date }) {
      const safeDate = encodeURIComponent(date);
      const url = `${BASE}/analytics/actionPages/${encodeURIComponent(smartlinkId)}?from=${safeDate}&to=${safeDate}`;
      const res = await fetchWithBackoff(url, { method: "GET", headers }, opts());
      await assertOk(res, "featurefm metrics");
      const j = (await res.json()) as MetricsResponse;
      return SmartlinkMetrics.parse({
        smartlinkId,
        date,
        clicks: j.totalClicks ?? 0,
        spotifyClicks: j.servicesClicks?.spotify ?? 0,
        estimatedStreams: j.spotifyEstimatedStreams ?? null,
      });
    },
  };
}
