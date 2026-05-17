CREATE TABLE IF NOT EXISTS "external_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service" text NOT NULL,
	"endpoint" text NOT NULL,
	"method" text NOT NULL,
	"status" integer,
	"duration_ms" integer,
	"error" text,
	"request_summary" jsonb,
	"response_summary" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "secrets" (
	"key" text PRIMARY KEY NOT NULL,
	"cipher_text" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
