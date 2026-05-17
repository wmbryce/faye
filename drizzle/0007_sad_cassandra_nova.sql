CREATE TABLE IF NOT EXISTS "ad_metric_daily" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ad_id" uuid NOT NULL,
	"date" date NOT NULL,
	"spend_cents" integer DEFAULT 0 NOT NULL,
	"impressions" integer DEFAULT 0 NOT NULL,
	"fb_link_clicks" integer DEFAULT 0 NOT NULL,
	"smartlink_clicks" integer DEFAULT 0 NOT NULL,
	"smartlink_streams" integer,
	"composite_score" real,
	"excluded_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ad_metric_daily_ad_id_date_unique" UNIQUE("ad_id","date")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "release_metric_daily" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"release_id" uuid NOT NULL,
	"date" date NOT NULL,
	"spotify_streams" integer,
	"spotify_listeners" integer,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "release_metric_daily_release_id_date_unique" UNIQUE("release_id","date")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ad_metric_daily" ADD CONSTRAINT "ad_metric_daily_ad_id_ads_id_fk" FOREIGN KEY ("ad_id") REFERENCES "public"."ads"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "release_metric_daily" ADD CONSTRAINT "release_metric_daily_release_id_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."releases"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
