-- Enforce allowed `kind` values at the database layer.
-- Drizzle's `text({ enum: [...] })` only constrains at the TS type level.
ALTER TABLE "assets"
  ADD CONSTRAINT "assets_kind_check"
  CHECK ("kind" IN ('image', 'video'));
--> statement-breakpoint
ALTER TABLE "releases"
  ADD CONSTRAINT "releases_kind_check"
  CHECK ("kind" IN ('track', 'album'));
