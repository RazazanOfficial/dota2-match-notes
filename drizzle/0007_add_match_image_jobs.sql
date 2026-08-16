CREATE TYPE "public"."match_image_job_status" AS ENUM('pending', 'processing', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE "match_image_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"match_id" uuid NOT NULL,
	"status" "match_image_job_status" DEFAULT 'pending' NOT NULL,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"run_after" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"error_code" varchar(64),
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "match_image_jobs_attempts_check" CHECK ("match_image_jobs"."attempts" >= 0)
);
--> statement-breakpoint
ALTER TABLE "match_image_jobs" ADD CONSTRAINT "match_image_jobs_match_id_journal_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."journal_matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "match_image_jobs_match_id_uidx" ON "match_image_jobs" USING btree ("match_id");--> statement-breakpoint
CREATE INDEX "match_image_jobs_status_run_after_idx" ON "match_image_jobs" USING btree ("status","run_after");--> statement-breakpoint
INSERT INTO "match_image_jobs" ("match_id")
SELECT "journal_matches"."id"
FROM "journal_matches"
INNER JOIN "dota_matches"
	ON "journal_matches"."dota_match_id" = "dota_matches"."match_id"
WHERE "journal_matches"."source" = 'opendota'
ON CONFLICT ("match_id") DO NOTHING;
