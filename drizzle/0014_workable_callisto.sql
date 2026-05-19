CREATE TABLE IF NOT EXISTS "smartlink_clicks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"smartlink_id" text NOT NULL,
	"clicked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_agent" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "smartlinks" (
	"id" text PRIMARY KEY NOT NULL,
	"destination_url" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "smartlink_clicks" ADD CONSTRAINT "smartlink_clicks_smartlink_id_smartlinks_id_fk" FOREIGN KEY ("smartlink_id") REFERENCES "public"."smartlinks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "smartlink_clicks_smartlink_clicked_idx" ON "smartlink_clicks" USING btree ("smartlink_id","clicked_at" DESC NULLS LAST);