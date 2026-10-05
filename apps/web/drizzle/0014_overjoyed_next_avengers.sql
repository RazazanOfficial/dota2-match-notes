CREATE TABLE "open_dota_parse_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"match_id" uuid NOT NULL,
	"dota_match_id" bigint NOT NULL,
	"status" "sync_job_status" DEFAULT 'pending' NOT NULL,
	"provider_job_id" varchar(32),
	"attempts" smallint DEFAULT 0 NOT NULL,
	"poll_attempts" smallint DEFAULT 0 NOT NULL,
	"run_after" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"error_code" varchar(64),
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "open_dota_parse_jobs_attempts_check" CHECK ("open_dota_parse_jobs"."attempts" >= 0 and "open_dota_parse_jobs"."poll_attempts" >= 0)
);
--> statement-breakpoint
ALTER TABLE "match_image_jobs" ADD COLUMN "started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "match_image_jobs" ADD COLUMN "progress_stage" varchar(24) DEFAULT 'queued' NOT NULL;--> statement-breakpoint
ALTER TABLE "match_image_jobs" ADD COLUMN "current_image" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "match_image_jobs" ADD COLUMN "completed_images" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "match_image_jobs" ADD COLUMN "expected_images" smallint DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE "open_dota_parse_jobs" ADD CONSTRAINT "open_dota_parse_jobs_match_id_journal_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."journal_matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "open_dota_parse_jobs_match_id_uidx" ON "open_dota_parse_jobs" USING btree ("match_id");--> statement-breakpoint
CREATE INDEX "open_dota_parse_jobs_status_run_after_idx" ON "open_dota_parse_jobs" USING btree ("status","run_after");--> statement-breakpoint
ALTER TABLE "match_image_jobs" ADD CONSTRAINT "match_image_jobs_progress_stage_check" CHECK ("match_image_jobs"."progress_stage" in ('queued','preparing','rendering','uploading','completed','failed'));--> statement-breakpoint
ALTER TABLE "match_image_jobs" ADD CONSTRAINT "match_image_jobs_progress_check" CHECK ("match_image_jobs"."current_image" between 0 and "match_image_jobs"."expected_images" and "match_image_jobs"."completed_images" between 0 and "match_image_jobs"."expected_images" and "match_image_jobs"."expected_images" between 1 and 10);