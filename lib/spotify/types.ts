import { z } from "zod";

export const ArtistPopularity = z.object({
  popularity: z.number().int().min(0).max(100),
  followers: z.number().int().nonnegative(),
});
export type ArtistPopularity = z.infer<typeof ArtistPopularity>;

export const TrackSummary = z.object({
  id: z.string(),
  title: z.string(),
  popularity: z.number().int().min(0).max(100),
});
export type TrackSummary = z.infer<typeof TrackSummary>;

export const DailyStreams = z.object({
  streams: z.number().int().nonnegative().nullable(),
  listeners: z.number().int().nonnegative().nullable(),
  source: z.enum(["s4a", "web_estimate"]),
});
export type DailyStreams = z.infer<typeof DailyStreams>;
