import type { SmartlinkClient } from "./client";
import type { FetchOpts } from "@/lib/external/fetch";
import { fetchWithBackoff } from "@/lib/external/fetch";
import { Smartlink, SmartlinkMetrics, CreateSmartlinkInput } from "./types";

const BASE = "https://api.feature.fm/manage/v1";

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
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`featurefm create: ${res.status} ${text}`);
      }
      const j: any = await res.json();
      return Smartlink.parse({
        id: j.id,
        shortUrl: j.url ?? j.shortUrl,
        longUrl: j.longUrl,
      });
    },

    async getDailyMetrics({ smartlinkId, date }) {
      const url = `${BASE}/analytics/actionPages/${encodeURIComponent(smartlinkId)}?from=${date}&to=${date}`;
      const res = await fetchWithBackoff(url, { method: "GET", headers }, opts());
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`featurefm metrics: ${res.status} ${text}`);
      }
      const j: any = await res.json();
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
