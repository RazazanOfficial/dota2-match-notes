ALTER TYPE "public"."match_ban_source" ADD VALUE 'stratz';--> statement-breakpoint
ALTER TYPE "public"."match_role_source" ADD VALUE 'stratz';--> statement-breakpoint
CREATE TABLE "stratz_enrichment_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"match_id" uuid NOT NULL,
	"status" "sync_job_status" DEFAULT 'pending' NOT NULL,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"run_after" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"error_code" varchar(64),
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stratz_enrichment_jobs_attempts_check" CHECK ("stratz_enrichment_jobs"."attempts" >= 0)
);
--> statement-breakpoint
ALTER TABLE "dota_matches" ADD COLUMN "stratz_raw_data" jsonb;--> statement-breakpoint
ALTER TABLE "dota_matches" ADD COLUMN "stratz_fetched_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "stratz_enrichment_jobs" ADD CONSTRAINT "stratz_enrichment_jobs_match_id_journal_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."journal_matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "stratz_enrichment_jobs_match_id_uidx" ON "stratz_enrichment_jobs" USING btree ("match_id");--> statement-breakpoint
CREATE INDEX "stratz_enrichment_jobs_status_run_after_idx" ON "stratz_enrichment_jobs" USING btree ("status","run_after");