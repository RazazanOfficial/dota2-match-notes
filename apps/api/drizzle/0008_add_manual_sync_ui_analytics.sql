CREATE TABLE "external_api_daily_usage" (
	"provider" varchar(32) NOT NULL,
	"day" date NOT NULL,
	"request_count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "external_api_daily_usage_pkey" PRIMARY KEY("provider","day"),
	CONSTRAINT "external_api_daily_usage_count_check" CHECK ("external_api_daily_usage"."request_count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "journal_matches" ADD COLUMN "analyzed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "manual_sync_cursor_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "external_api_daily_usage_day_idx" ON "external_api_daily_usage" USING btree ("day");--> statement-breakpoint
UPDATE "journal_matches" AS jm
SET "analyzed_at" = dm."fetched_at"
FROM "dota_matches" AS dm
WHERE jm."dota_match_id" = dm."match_id"
  AND jm."source" = 'opendota'
  AND jm."analyzed_at" IS NULL;
