import { pgTable, text, timestamp, uuid, integer, jsonb, boolean, date } from "drizzle-orm/pg-core";
import type { TargetingSpec } from "@/lib/audiences/spec";

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const sessions = pgTable("sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type Session = typeof sessions.$inferSelect;

export const artists = pgTable("artists", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  spotifyArtistId: text("spotify_artist_id").notNull().unique(),
  timezone: text("timezone").notNull(),
  fbPageId: text("fb_page_id"),
  voiceGuide: text("voice_guide").notNull().default(""),
  spotifyForArtistsToken: text("s4a_token"),
  notes: text("notes").notNull().default(""),
  archived: boolean("archived").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const assets = pgTable("assets", {
  id: uuid("id").defaultRandom().primaryKey(),
  artistId: uuid("artist_id").notNull().references(() => artists.id, { onDelete: "cascade" }),
  kind: text("kind", { enum: ["image", "video"] }).notNull(),
  url: text("url").notNull(),
  label: text("label").notNull().default(""),
  bytes: integer("bytes").notNull(),
  contentType: text("content_type").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const releases = pgTable("releases", {
  id: uuid("id").defaultRandom().primaryKey(),
  artistId: uuid("artist_id").notNull().references(() => artists.id, { onDelete: "cascade" }),
  kind: text("kind", { enum: ["track", "album"] }).notNull(),
  spotifyId: text("spotify_id").notNull().unique(),
  title: text("title").notNull(),
  releaseDate: date("release_date").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const audienceSeeds = pgTable("audience_seeds", {
  id: uuid("id").defaultRandom().primaryKey(),
  artistId: uuid("artist_id").notNull().references(() => artists.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  targetingSpec: jsonb("targeting_spec").$type<TargetingSpec>().notNull(),
  archived: boolean("archived").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Artist = typeof artists.$inferSelect;
export type Asset = typeof assets.$inferSelect;
export type Release = typeof releases.$inferSelect;
export type AudienceSeed = typeof audienceSeeds.$inferSelect;

export const secrets = pgTable("secrets", {
  key: text("key").primaryKey(),
  cipherText: text("cipher_text").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const externalCalls = pgTable("external_calls", {
  id: uuid("id").defaultRandom().primaryKey(),
  service: text("service").notNull(),
  endpoint: text("endpoint").notNull(),
  method: text("method").notNull(),
  status: integer("status"),
  durationMs: integer("duration_ms"),
  error: text("error"),
  requestSummary: jsonb("request_summary"),
  responseSummary: jsonb("response_summary"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Secret = typeof secrets.$inferSelect;
export type ExternalCall = typeof externalCalls.$inferSelect;
