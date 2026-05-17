DO $$ BEGIN
 ALTER TABLE "ads" ADD CONSTRAINT "ads_parent_ad_id_ads_id_fk" FOREIGN KEY ("parent_ad_id") REFERENCES "public"."ads"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ads_campaign_created_idx" ON "ads" USING btree ("campaign_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ads_audience_created_idx" ON "ads" USING btree ("audience_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ads_parent_ad_id_idx" ON "ads" USING btree ("parent_ad_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audiences_campaign_idx" ON "audiences" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_log_entity_created_idx" ON "audit_log" USING btree ("entity_type","entity_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "campaigns_artist_created_idx" ON "campaigns" USING btree ("artist_id","created_at" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "ads" ADD CONSTRAINT "ads_generation_nonnegative_chk" CHECK ("ads"."generation" >= 0);--> statement-breakpoint
ALTER TABLE "audiences" ADD CONSTRAINT "audiences_daily_budget_positive_chk" CHECK ("audiences"."daily_budget_cents" > 0);--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_daily_budget_positive_chk" CHECK ("campaigns"."daily_budget_cents" > 0);--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_date_range_chk" CHECK ("campaigns"."end_date" >= "campaigns"."start_date");