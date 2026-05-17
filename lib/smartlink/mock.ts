import type { SmartlinkClient } from "./client";
import type { CreateSmartlinkInput, Smartlink, SmartlinkMetrics } from "./types";

export function makeMockSmartlinkClient(overrides?: {
  create?: (input: CreateSmartlinkInput) => Partial<Smartlink>;
  getDailyMetrics?: (args: { smartlinkId: string; date: string }) => Partial<SmartlinkMetrics>;
}): SmartlinkClient {
  let nextId = 1;
  return {
    async create(input) {
      const stub = overrides?.create?.(input) ?? {};
      const id = stub.id ?? `mock_sl_${nextId++}`;
      return {
        id,
        shortUrl: stub.shortUrl ?? `https://ffm.to/${id}`,
        longUrl: stub.longUrl,
      };
    },
    async getDailyMetrics(args) {
      const stub = overrides?.getDailyMetrics?.(args) ?? {};
      return {
        smartlinkId: args.smartlinkId,
        date: args.date,
        clicks: stub.clicks ?? 0,
        spotifyClicks: stub.spotifyClicks ?? 0,
        estimatedStreams: stub.estimatedStreams ?? null,
      };
    },
  };
}
