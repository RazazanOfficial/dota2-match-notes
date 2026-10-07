ALTER TABLE "local_replay_jobs" ADD COLUMN "intent" varchar(16) DEFAULT 'analysis' NOT NULL;
--> statement-breakpoint
ALTER TABLE "local_replay_jobs" ADD COLUMN "archive_key" text;
--> statement-breakpoint
ALTER TABLE "local_replay_jobs" ADD COLUMN "archive_bytes" integer;
--> statement-breakpoint
ALTER TABLE "local_replay_jobs" ADD COLUMN "archived_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "local_replay_jobs" ADD CONSTRAINT "local_replay_jobs_intent_check" CHECK ("intent" in ('download','analysis'));
--> statement-breakpoint
UPDATE "local_replay_jobs" SET status = 'failed', locked_at = NULL, finished_at = now(), updated_at = now(), error_code = 'legacy_auto_job_disabled', error_message = 'Request replay explicitly to retry' WHERE status <> 'completed';
