ALTER TABLE "sync_jobs" ADD COLUMN "manual_request" jsonb;--> statement-breakpoint
ALTER TABLE "sync_jobs" ADD COLUMN "manual_attempted" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "sync_jobs" ADD COLUMN "manual_result" jsonb;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "last_day_sync_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "last_week_sync_at" timestamp with time zone;--> statement-breakpoint
UPDATE local_replay_jobs SET retry_deadline_at = greatest(retry_deadline_at, now() + interval '20 days')
WHERE status = 'pending' AND error_code IN (
  'replay_metadata_pending', 'replay_metadata_rate_limited', 'replay_metadata_unavailable'
);
