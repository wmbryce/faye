import { pgTable, text, timestamp, uuid, integer, jsonb, boolean, date, check, index, type AnyPgColumn } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
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

export const campaigns = pgTable("campaigns", {
  id: uuid("id").defaultRandom().primaryKey(),
  artistId: uuid("artist_id").notNull().references(() => artists.id, { onDelete: "cascade" }),
  releaseId: uuid("release_id").notNull().references(() => releases.id, { onDelete: "cascade" }),
  smartlinkId: text("smartlink_id"),
  smartlinkUrl: text("smartlink_url"),
  dailyBudgetCents: integer("daily_budget_cents").notNull(),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  status: text("status", { enum: ["draft", "active", "paused", "ended"] }).notNull().default("draft"),
  fbCampaignId: text("fb_campaign_id"),
  timezone: text("timezone").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  budgetPositive: check("campaigns_daily_budget_positive_chk", sql`${t.dailyBudgetCents} > 0`),
  dateRange: check("campaigns_date_range_chk", sql`${t.endDate} >= ${t.startDate}`),
  artistCreatedIdx: index("campaigns_artist_created_idx").on(t.artistId, t.createdAt.desc()),
}));

export const audiences = pgTable("audiences", {
  id: uuid("id").defaultRandom().primaryKey(),
  campaignId: uuid("campaign_id").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
  seedId: uuid("seed_id").references(() => audienceSeeds.id),
  name: text("name").notNull(),
  fbTargetingSpec: jsonb("fb_targeting_spec").notNull(),
  fbAdSetId: text("fb_ad_set_id"),
  dailyBudgetCents: integer("daily_budget_cents").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  budgetPositive: check("audiences_daily_budget_positive_chk", sql`${t.dailyBudgetCents} > 0`),
  campaignIdx: index("audiences_campaign_idx").on(t.campaignId),
}));

export const ads = pgTable("ads", {
  id: uuid("id").defaultRandom().primaryKey(),
  campaignId: uuid("campaign_id").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
  audienceId: uuid("audience_id").notNull().references(() => audiences.id, { onDelete: "cascade" }),
  assetId: uuid("asset_id").notNull().references(() => assets.id),
  generation: integer("generation").notNull().default(0),
  copyHeadline: text("copy_headline").notNull(),
  copyBody: text("copy_body").notNull(),
  copyPrimaryText: text("copy_primary_text").notNull(),
  fbAdId: text("fb_ad_id"),
  status: text("status", { enum: ["draft", "pending", "published", "rejected", "paused", "killed"] }).notNull().default("draft"),
  publishAt: timestamp("publish_at", { withTimezone: true }),
  rejectedAt: timestamp("rejected_at", { withTimezone: true }),
  rejectedReason: text("rejected_reason"),
  parentAdId: uuid("parent_ad_id").references((): AnyPgColumn => ads.id, { onDelete: "set null" }),
  promptHash: text("prompt_hash"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  generationNonNeg: check("ads_generation_nonnegative_chk", sql`${t.generation} >= 0`),
  campaignCreatedIdx: index("ads_campaign_created_idx").on(t.campaignId, t.createdAt.desc()),
  audienceCreatedIdx: index("ads_audience_created_idx").on(t.audienceId, t.createdAt.desc()),
  parentAdIdx: index("ads_parent_ad_id_idx").on(t.parentAdId),
}));

export const auditLog = pgTable("audit_log", {
  id: uuid("id").defaultRandom().primaryKey(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  event: text("event").notNull(),
  payload: jsonb("payload"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  entityCreatedIdx: index("audit_log_entity_created_idx").on(t.entityType, t.entityId, t.createdAt.desc()),
}));

export type Campaign = typeof campaigns.$inferSelect;
export type Audience = typeof audiences.$inferSelect;
export type Ad = typeof ads.$inferSelect;
export type AuditLogEntry = typeof auditLog.$inferSelect;
