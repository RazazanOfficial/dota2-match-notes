ALTER TABLE "local_replay_jobs" ADD COLUMN "archive_status" varchar(16) DEFAULT 'missing' NOT NULL;
--> statement-breakpoint
UPDATE "local_replay_jobs" SET "archive_status" = 'active' WHERE "archive_key" IS NOT NULL;
--> statement-breakpoint
ALTER TABLE "local_replay_jobs" ADD CONSTRAINT "local_replay_jobs_archive_status_check" CHECK ("archive_status" in ('active','missing','deleted'));
