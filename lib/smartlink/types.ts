import { z } from "zod";

export const CreateSmartlinkInput = z.object({
  artistName: z.string().min(1),
  releaseTitle: z.string().min(1),
  spotifyTrackOrAlbumUrl: z.string().url(),
  slug: z.string().regex(/^[a-z0-9-]+$/).optional(),
});
export type CreateSmartlinkInput = z.infer<typeof CreateSmartlinkInput>;

export const Smartlink = z.object({
  id: z.string(),
  shortUrl: z.string().url(),
  longUrl: z.string().url().optional(),
});
export type Smartlink = z.infer<typeof Smartlink>;

export const SmartlinkMetrics = z.object({
  smartlinkId: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  clicks: z.number().int().nonnegative(),
  spotifyClicks: z.number().int().nonnegative(),
  estimatedStreams: z.number().int().nonnegative().nullable(),
});
export type SmartlinkMetrics = z.infer<typeof SmartlinkMetrics>;
