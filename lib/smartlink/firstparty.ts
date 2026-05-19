import { randomBytes } from "node:crypto";
import { and, count, eq, gte, lt } from "drizzle-orm";
import { db } from "@/lib/db";
import { smartlinks, smartlinkClicks } from "@/lib/db/schema";
import type { SmartlinkClient } from "./client";
import { CreateSmartlinkInput } from "./types";

const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
const SHORTCODE_LEN = 8;
const MAX_COLLISION_RETRIES = 5;

function genShortcode(len = SHORTCODE_LEN): string {
  const buf = randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) out += ALPHABET[buf[i] % ALPHABET.length];
  return out;
}

function nextDateISO(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function makeFirstPartyClient({
  appUrl,
  shortcodeFn = genShortcode,
}: { appUrl: string; shortcodeFn?: () => string }): SmartlinkClient {
  return {
    async create(input) {
      const { spotifyTrackOrAlbumUrl } = CreateSmartlinkInput.parse(input);
      for (let attempt = 0; attempt < MAX_COLLISION_RETRIES; attempt++) {
        const id = shortcodeFn();
        const inserted = await db
          .insert(smartlinks)
          .values({ id, destinationUrl: spotifyTrackOrAlbumUrl })
          .onConflictDoNothing()
          .returning({ id: smartlinks.id });
        if (inserted.length > 0) {
          return { id, shortUrl: `${appUrl}/l/${id}`, longUrl: spotifyTrackOrAlbumUrl };
        }
      }
      throw new Error(`smartlink: failed to generate unique shortcode after ${MAX_COLLISION_RETRIES} attempts`);
    },

    async getDailyMetrics({ smartlinkId, date }) {
      const startOfDay = new Date(`${date}T00:00:00Z`);
      const startOfNextDay = new Date(`${nextDateISO(date)}T00:00:00Z`);
      const [row] = await db
        .select({ count: count() })
        .from(smartlinkClicks)
        .where(and(
          eq(smartlinkClicks.smartlinkId, smartlinkId),
          gte(smartlinkClicks.clickedAt, startOfDay),
          lt(smartlinkClicks.clickedAt, startOfNextDay),
        ));
      const clicks = Number(row?.count ?? 0);
      return { smartlinkId, date, clicks, spotifyClicks: clicks, estimatedStreams: null };
    },
  };
}
